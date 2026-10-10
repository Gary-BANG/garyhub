#!/usr/bin/env python3
import fcntl, hashlib, json, os, re, shutil, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

os.umask(0o077)
BASE=Path(__file__).resolve().parent.parent
ROOT=Path('/opt/garyhub-access')
STAMP=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
BACKUP=Path('/root/garyhub-access-backup-'+STAMP)
NAME='garyhub-lab'
OLD_NAME='garyhub-lab-before-access-'+STAMP.lower()
NET='my-services_default'
X=Path('/usr/local/etc/xray/config.json')
C=Path('/opt/my-services/caddy/Caddyfile')
UNIT=Path('/etc/systemd/system/garyhub-access-sync.service')
TIMER=Path('/etc/systemd/system/garyhub-access-sync.timer')
CONF=Path('/etc/garyhub-access.json')
lock=open('/root/garyhub-access-install.lock','a');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
BACKUP.mkdir(mode=0o700)
log=open(BACKUP/'private-install.log','w')
old_stopped=False;old_renamed=False;new_attempted=False;caddy_touched=False;host_installed=False
container_candidate='/etc/caddy/.garyhub-access-'+STAMP

def run(args,timeout=60):
    p=subprocess.run(args,capture_output=True,timeout=timeout)
    if p.returncode:
        log.write(repr(args)+'\n'+p.stdout.decode(errors='replace')+p.stderr.decode(errors='replace'));log.flush()
        raise RuntimeError('Command failed: '+args[0]+' (private log saved)')
    return p.stdout

def overwrite(path,content):
    with open(path,'wb') as f:f.write(content);f.flush();os.fsync(f.fileno())

def reload():run(['docker','exec','caddy','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])

def request(host,path):
    result=run(['curl','--noproxy','*','-sS','--max-time','10','--resolve',host+':443:127.0.0.1',
                '-w','\n%{http_code}','https://'+host+path])
    body,code=result.rsplit(b'\n',1)
    return int(code),body

try:
    print('[1/7] Checking current deployment and preserving private backups...',flush=True)
    if os.geteuid()!=0:raise RuntimeError('Run as root')
    if CONF.exists() or UNIT.exists() or TIMER.exists():raise RuntimeError('Access synchronization is already installed; do not reinstall')
    run(['docker','compose','version'])
    run(['systemctl','is-active','--quiet','xray'])
    info=json.loads(run(['docker','inspect',NAME]))[0]
    if info['Config'].get('User') not in ['', 'root', '0', '0:0']:raise RuntimeError('Lab container user requires review')
    if set(info['NetworkSettings']['Networks'])!={NET}:raise RuntimeError('Unexpected Lab networks')
    if info['HostConfig'].get('PortBindings'):raise RuntimeError('Unexpected public Lab port bindings')
    mounts=info.get('Mounts',[])
    if len(mounts)!=1 or mounts[0]['Type']!='bind' or mounts[0]['Destination']!='/data':raise RuntimeError('Unexpected Lab data mount')
    data=Path(mounts[0]['Source'])
    if data!=Path('/opt/my-services/lab-data'):raise RuntimeError('Unexpected Lab data source')
    for item in json.loads((BASE/'access-host/baseline.json').read_text()):
        actual=run(['docker','exec',NAME,'cat','/lab/'+item['path']]).replace(b'\r\n',b'\n')
        if hashlib.sha256(actual).hexdigest()!=item['sha256']:
            raise RuntimeError('Live source differs from uploaded baseline: '+item['path'])
    old_x=X.read_bytes();old_c=C.read_bytes()
    if run(['docker','exec','caddy','cat','/etc/caddy/Caddyfile'])!=old_c:raise RuntimeError('Caddy bind mount mismatch')
    config=json.loads(old_x)
    inbound=next(i for i in config['inbounds'] if i.get('tag')=='garyhub-access-wss')
    gateway=json.loads(run(['docker','inspect','caddy','--format','{{json .NetworkSettings.Networks}}']))[NET]['Gateway']
    if inbound.get('listen')!=gateway or inbound.get('port')!=18080 or inbound.get('protocol')!='vless':raise RuntimeError('WSS listener changed')
    ws_path=inbound['streamSettings']['wsSettings']['path']
    old_block=f'''vpn.garyhub.uk {{
    @access path {ws_path}
    route {{
        reverse_proxy @access {gateway}:18080
        respond 404
    }}
}}'''
    new_block=f'''vpn.garyhub.uk {{
    log_skip /sub/*
    @access path {ws_path}
    route {{
        reverse_proxy @access {gateway}:18080
        reverse_proxy /sub/* garyhub-lab:3000
        respond 404
    }}
}}'''
    if old_c.decode().count(old_block)!=1:raise RuntimeError('WSS Caddy block differs; refusing blind replacement')
    new_c=old_c.decode().replace(old_block,new_block).encode()
    (BACKUP/'xray-original.json').write_bytes(old_x);(BACKUP/'Caddyfile-original').write_bytes(old_c)
    (BACKUP/'lab-inspect-private.json').write_text(json.dumps(info))
    (BACKUP/'Caddyfile-candidate').write_bytes(new_c)
    run(['docker','cp',str(BACKUP/'Caddyfile-candidate'),'caddy:'+container_candidate])
    run(['docker','exec','caddy','caddy','validate','--config',container_candidate,'--adapter','caddyfile'])

    print('[2/7] Building the new Lab image from the currently running image...',flush=True)
    ROOT.mkdir(mode=0o700,exist_ok=True)
    release=ROOT/'releases'/STAMP;release.mkdir(parents=True,mode=0o700)
    app=release/'app';app.mkdir()
    for filename in ['server.cjs','access-store.cjs','access-connection.cjs']:
        shutil.copy2(BASE/'lab-service'/filename,app/filename)
    shutil.copytree(BASE/'lab-service/public/access',app/'access')
    for filename in ['index.html','login.html','login.js']:
        shutil.copy2(BASE/'lab-service/public'/filename,app/filename)
    (app/'Dockerfile').write_text('ARG BASE_IMAGE\nFROM ${BASE_IMAGE}\nCOPY server.cjs access-store.cjs access-connection.cjs /lab/\nCOPY access /lab/public/access\nCOPY index.html login.html login.js /lab/public/\nCMD ["node", "/lab/server.cjs"]\n')
    base_image='garyhub-access-base:'+STAMP.lower();image='garyhub-lab-access:'+STAMP.lower()
    run(['docker','tag',info['Image'],base_image])
    run(['docker','build','--pull=false','--build-arg','BASE_IMAGE='+base_image,'-t',image,str(app)],timeout=600)
    runtime=ROOT/'runtime';runtime.mkdir(mode=0o700,exist_ok=True)
    env=dict(v.split('=',1) for v in info['Config']['Env'])
    env.update({'PUBLIC_ORIGIN':'https://lab.garyhub.uk','LAB_DATA_DIR':'/data','ACCESS_RUNTIME_FILE':'/access-runtime/status.json','ACCESS_SUB_ORIGIN':'https://vpn.garyhub.uk'})
    service={'image':image,'container_name':NAME,'restart':'unless-stopped','environment':env,
             'volumes':[str(data)+':/data',str(runtime)+':/access-runtime:ro'],'networks':['services'],
             'healthcheck':{'test':['CMD','node','-e',"fetch('http://localhost:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],'interval':'30s','timeout':'5s','retries':3}}
    compose={'name':'garyhub-access','services':{'lab':service},'networks':{'services':{'external':True,'name':NET}}}
    compose_file=ROOT/'compose.json';compose_file.write_text(json.dumps(compose,indent=2))

    print('[3/7] Taking a consistent Lab data backup and switching its container...',flush=True)
    if C.read_bytes()!=old_c or X.read_bytes()!=old_x:raise RuntimeError('Server config changed during build; stopped before switching')
    run(['docker','stop',NAME]);old_stopped=True
    shutil.copytree(data,BACKUP/'lab-data')
    run(['docker','update','--restart=no',NAME])
    run(['docker','rename',NAME,OLD_NAME]);old_renamed=True
    new_attempted=True
    run(['docker','compose','-f',str(compose_file),'up','-d','--no-build'],timeout=120)
    healthy=False
    for attempt in range(20):
        try:
            result=run(['docker','exec',NAME,'node','-e',"fetch('http://localhost:3000/health').then(async r=>{const d=await r.json();if(d.accessVersion!==2)process.exit(1)}).catch(()=>process.exit(1))"])
            healthy=True;break
        except Exception:time.sleep(1)
    if not healthy:raise RuntimeError('New Lab container did not become healthy')

    print('[4/7] Installing the local entitlement synchronizer...',flush=True)
    shutil.copy2(BASE/'access-host/reconcile.py',ROOT/'reconcile.py')
    for filename in ['finish-migration.py','finish-migration.sh']:
        shutil.copy2(BASE/'access-host'/filename,ROOT/filename)
    settings={'entitlements':str(data/'access-entitlements.json'),'runtime':str(runtime/'status.json'),
              'xray_config':str(X),'gateway':gateway,'xray_bin':shutil.which('xray'),
              'lock':str(ROOT/'sync.lock'),'backup':str(ROOT/'xray-last-good.json')}
    host_installed=True
    CONF.write_text(json.dumps(settings))
    UNIT.write_text('[Unit]\nDescription=GaryHub access entitlement synchronization\nAfter=xray.service docker.service\n\n[Service]\nType=oneshot\nExecStart=/usr/bin/python3 /opt/garyhub-access/reconcile.py\nUMask=0077\nTimeoutStartSec=90\n')
    TIMER.write_text('[Unit]\nDescription=Synchronize GaryHub access every 15 seconds\n\n[Timer]\nOnBootSec=15s\nOnUnitInactiveSec=15s\nAccuracySec=1s\n\n[Install]\nWantedBy=timers.target\n')
    UNIT.chmod(0o644);TIMER.chmod(0o644)
    run(['systemctl','daemon-reload'])
    run(['systemctl','start','garyhub-access-sync.service'],timeout=100)
    run(['systemctl','enable','--now','garyhub-access-sync.timer'])

    print('[5/7] Enabling the subscription route and protecting its access logs...',flush=True)
    if C.read_bytes()!=old_c:raise RuntimeError('Caddy changed during deployment')
    caddy_touched=True;overwrite(C,new_c)
    if run(['docker','exec','caddy','cat','/etc/caddy/Caddyfile'])!=new_c:raise RuntimeError('Caddy bind mount mismatch after write')
    reload()

    print('[6/7] Checking authentication, subscription routing and synchronization...',flush=True)
    # Retry briefly while Caddy's connection pool resolves the replacement container.
    for attempt in range(10):
        code,body=request('lab.garyhub.uk','/health')
        if code==200 and json.loads(body).get('accessVersion')==2:break
        time.sleep(1)
    else:raise RuntimeError('Public Lab health failed')
    if request('lab.garyhub.uk','/api/access/status')[0]!=401:raise RuntimeError('Authentication gate failed')
    if request('lab.garyhub.uk','/access/')[0]!=302:raise RuntimeError('Login redirect failed')
    code,body=request('vpn.garyhub.uk','/sub/invalid')
    if code!=404 or '订阅' not in body.decode():raise RuntimeError('Subscription route failed')
    run(['systemctl','is-active','--quiet','garyhub-access-sync.timer'])
    state=json.loads((runtime/'status.json').read_text())
    if not state.get('ok'):raise RuntimeError('Synchronizer unhealthy')
    (ROOT/'installed.json').write_text(json.dumps({'version':2,'backup':str(BACKUP),'previousContainer':OLD_NAME,'image':image,'installedAt':STAMP}))
    print('[7/7] DONE: https://lab.garyhub.uk/access/',flush=True)
    print('Sign in with your Calendar admin account. Configure the store, generate a code, and redeem it.')
    print('Credentials normally synchronize within one minute; changes may briefly reconnect Xray clients.')
    print('The old 8080 inbound and the temporary WSS test client remain unchanged.')
    print('Backup: '+str(BACKUP))
except BaseException as error:
    print('FAILED:',type(error).__name__,str(error),flush=True)
    failures=[]
    def attempt(label,fn):
        try:fn()
        except BaseException:failures.append(label)
    if host_installed:
        attempt('stop sync',lambda:run(['systemctl','disable','--now','garyhub-access-sync.timer']))
        attempt('stop sync job',lambda:run(['systemctl','stop','garyhub-access-sync.service']))
    if new_attempted:attempt('remove new Lab',lambda:run(['docker','rm','-f',NAME]))
    if old_renamed:attempt('restore Lab name',lambda:run(['docker','rename',OLD_NAME,NAME]))
    if old_stopped:
        restart=info['HostConfig']['RestartPolicy']['Name'] or 'no'
        attempt('restore restart policy',lambda:run(['docker','update','--restart='+restart,NAME]))
        attempt('start old Lab',lambda:run(['docker','start',NAME]))
    if caddy_touched:
        attempt('restore Caddyfile',lambda:overwrite(C,old_c));attempt('reload original Caddy',reload)
    if host_installed:
        attempt('restore Xray config',lambda:overwrite(X,old_x))
        attempt('restart Xray',lambda:run(['systemctl','restart','xray']))
        for path in [CONF,UNIT,TIMER]:attempt('remove '+path.name,lambda p=path:p.unlink(missing_ok=True))
        attempt('reload units',lambda:run(['systemctl','daemon-reload']))
    print('ROLLBACK: '+('NEEDS ATTENTION: '+', '.join(failures) if failures else 'completed or no live changes'))
    print('Private logs and backups: '+str(BACKUP))
    sys.exit(1)
finally:
    if shutil.which('docker'):subprocess.run(['docker','exec','caddy','rm','-f',container_candidate],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    log.close()
