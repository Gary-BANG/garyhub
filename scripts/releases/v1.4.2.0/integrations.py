"""Reviewed host integrations around the shared image updater; no database rollback."""
import copy,hashlib,json,os,re,secrets,shutil,socket,subprocess
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from service_discovery import running_containers,upstream,endpoint_container,database_connection,verify_database,backup_database,postgres_data_path
MONITOR=Path('/var/lib/garyhub-monitor')
ACCESS_SETTINGS=Path('/etc/garyhub-access.json')
FILES={'/etc/garyhub-monitor.json':None,'/opt/garyhub-monitor/collect.py':'support/collect.py','/etc/systemd/system/garyhub-monitor.service':'support/garyhub-monitor.service','/etc/systemd/system/garyhub-monitor.timer':'support/garyhub-monitor.timer'}

def block(text,domain):
 matches=list(re.finditer(r'(?m)^'+re.escape(domain)+r'\s*\{',text))
 if len(matches)!=1:raise RuntimeError('Expected one Caddy site for '+domain)
 start=matches[0].end();depth=1;quote=None;comment=False;escape=False
 for i in range(start,len(text)):
  c=text[i]
  if comment:
   if c=='\n':comment=False
  elif quote:
   if escape:escape=False
   elif c=='\\':escape=True
   elif c==quote:quote=None
  elif c=='#':comment=True
  elif c in ['"',"'",'`']:quote=c
  elif c=='{':depth+=1
  elif c=='}':
   depth-=1
   if depth==0:return start,i
 raise RuntimeError('Unbalanced Caddy site')

def caddy_candidate(text,reading_upstream='miniflux:8080'):
 for domain,tool in [('files.garyhub.uk','files'),('kuma.garyhub.uk','status')]:
  start,end=block(text,domain);body=text[start:end]
  if 'forward_auth' in body:raise RuntimeError('Existing external authentication needs review: '+domain)
  gate='\n    forward_auth calendar-app:3000 {\n        uri /api/hub/tool-auth/'+tool+'?browser=1\n    }\n'
  text=text[:start]+gate+body+text[end:]
 start,end=block(text,'rss.garyhub.uk');body=text[start:end]
 pattern=r'(?m)(\breverse_proxy\s+)(?:"?'+re.escape(reading_upstream)+r'"?)(?=\s|$|[{}])'
 if len(re.findall(pattern,body))!=1 or 'forward_auth' in body:raise RuntimeError('Reading Caddy upstream needs review')
 body=re.sub(pattern,r'\1garyhub-lab:3000',body);text=text[:start]+body+text[end:]
 return text

def xray_candidate(config):
 config=copy.deepcopy(config);api=config.get('api')
 if api and(api.get('listen')!='127.0.0.1:10085' or set(api.get('services',[]))!={'StatsService'}):raise RuntimeError('Existing Xray API needs review; no config overwritten')
 config['api']={'tag':'garyhub-stats','listen':'127.0.0.1:10085','services':['StatsService']};config.setdefault('stats',{})
 policy=config.setdefault('policy',{});levels=policy.setdefault('levels',{});levels.setdefault('0',{})
 for level in levels.values():level.update(statsUserUplink=True,statsUserDownlink=True)
 system=policy.setdefault('system',{});system.update(statsInboundUplink=True,statsInboundDownlink=True)
 return config

def restore_xray(current,old,installed):
 """Remove only the managed statistics fields; retain current VPN clients and other edits."""
 result=copy.deepcopy(current)
 for key in ['api','stats']:
  if current.get(key)!=installed.get(key):raise RuntimeError('Xray statistics configuration changed; rollback needs review')
  if key in old:result[key]=copy.deepcopy(old[key])
  else:result.pop(key,None)
 policy=result.setdefault('policy',{});original=old.get('policy',{})
 for group,keys in [('levels',['statsUserUplink','statsUserDownlink']),('system',['statsInboundUplink','statsInboundDownlink'])]:
  blocks=policy.get(group,{})
  expected=installed.get('policy',{}).get(group,{})
  originals=original.get(group,{})
  rows=list(expected)if group=='levels'else[None]
  for level in rows:
   block=blocks.get(level,{})if level is not None else blocks
   before=originals.get(level,{})if level is not None else originals
   for key in keys:
    if block.get(key)is not True:raise RuntimeError('Xray policy statistics changed; rollback needs review')
    if key in before:block[key]=before[key]
    else:block.pop(key,None)
   if level is not None and not block and level not in originals:blocks.pop(level,None)
  if not blocks and group not in original:policy.pop(group,None)
 if not policy and 'policy'not in old:result.pop('policy',None)
 return result

def install(d):
 def no_public_ports(live):
  for mappings in(live.get('NetworkSettings',{}).get('Ports',{})or{}).values():
   for entry in mappings or[]:
    if entry.get('HostIp')not in ['127.0.0.1','::1']:raise RuntimeError('An external service has a public backend port; access gating needs review')
 def file_backup(path,backup):
  p=Path(path)
  if p.is_symlink():raise RuntimeError('Unexpected linked integration file')
  info={'path':str(p),'existed':p.is_file()}
  if info['existed']:
   target=backup/('integration-'+hashlib.sha256(str(p).encode()).hexdigest()[:16]);shutil.copy2(p,target);info.update(backup=str(target),old_sha=d.sha(p))
  return info
 def validate_caddy(path):
  target='/tmp/garyhub-v1420-candidate';d.run(['docker','cp',path,'caddy:'+target])
  try:d.run(['docker','exec','caddy','caddy','validate','--config',target,'--adapter','caddyfile'])
  finally:d.run(['docker','exec','caddy','rm','-f',target],False)
 def prepare(s,configs,lives,backup):
  d.say('    Identifying Reading, database, Files and Status from their active connections...')
  inventory=running_containers(d);caddy_live=d.image('caddy');caddy_text=Path(s['caddy_path']).read_text();targets={}
  for domain in ['rss.garyhub.uk','files.garyhub.uk','kuma.garyhub.uk']:
   start,end=block(caddy_text,domain);targets[domain]=upstream(caddy_text[start:end])
  runner=lives['calendar-app']['Image']
  mf=endpoint_container(d,caddy_live,targets['rss.garyhub.uk']['host'],inventory,runner,'Reading')
  connection=database_connection(mf)
  pg=endpoint_container(d,mf,connection['host'],inventory,runner,'Reading database')
  files=endpoint_container(d,caddy_live,targets['files.garyhub.uk']['host'],inventory,runner,'Files')
  kuma=endpoint_container(d,caddy_live,targets['kuma.garyhub.uk']['host'],inventory,runner,'Status')
  verified=verify_database(pg,connection)
  d.say('    Reading database identity verified; original service names retained.')
  for live in [mf,pg,files,kuma]:no_public_ports(live)
  version=d.run(['docker','exec',mf['Name'].lstrip('/'),'miniflux','-version']).stdout.decode().strip()
  if not re.search(r'\b2\.\d+',version):raise RuntimeError('Miniflux 2.x with proxy authentication is required')
  if Path('/etc/garyhub-monitor.json').exists():raise RuntimeError('Existing monitor installation requires review')
  timer=d.run(['systemctl','is-enabled','garyhub-monitor.timer'],False)
  if timer.returncode==0:raise RuntimeError('An existing monitor timer must be reviewed')
  access=json.loads(ACCESS_SETTINGS.read_text());xfile=Path(access['xray_config'])
  old=xfile.read_bytes();candidate=xray_candidate(json.loads(old));new=(json.dumps(candidate,indent=2)+'\n').encode();staged=backup/'xray-candidate.json';staged.write_bytes(new);os.chmod(staged,0o600)
  # Never acquire a port that is already in use by an unrelated local process.
  if not json.loads(old).get('api'):
   with socket.socket()as sock:sock.bind(('127.0.0.1',10085))
  d.run([access['xray_bin'],'run','-test','-config='+str(staged)])
  # Serialize installation against the existing entitlement reconciler at apply time.
  mc,conf=d.compose_config(mf,backup);conf=copy.deepcopy(conf);entry=conf['services'][mc['service']]
  networks=set(mf['NetworkSettings']['Networks'])&set(lives['garyhub-lab']['NetworkSettings']['Networks'])&set(lives['calendar-app']['NetworkSettings']['Networks'])
  if len(networks)!=1:raise RuntimeError('Reading services need one identified shared private network')
  net=d.jr(['docker','network','inspect',next(iter(networks))])[0];subnets=[i['Subnet']for i in net['IPAM']['Config']if i.get('Subnet')]
  if not subnets:raise RuntimeError('Reading private subnet missing')
  env=entry.setdefault('environment',{});env.update(AUTH_PROXY_HEADER='X-GaryHub-User',AUTH_PROXY_USER_CREATION='1',TRUSTED_REVERSE_PROXY_NETWORKS=','.join(subnets),BASE_URL='https://rss.garyhub.uk',DISABLE_LOCAL_AUTH='1')
  d.write(mc['new_config'],conf);mc['new_image_id']=mf['Image']
  for service in ['calendar-app','garyhub-lab']:
   e=configs[service]['services'][s['services'][service]['service']];e.setdefault('environment',{})['MINIFLUX_URL']=targets['rss.garyhub.uk']['origin']
   if service=='calendar-app':
    namespace_file=d.ROOT/'reading-namespace'
    if namespace_file.is_symlink():raise RuntimeError('Unexpected Reading namespace link')
    namespace=e['environment'].get('READING_NAMESPACE')or(namespace_file.read_text().strip()if namespace_file.exists()else secrets.token_hex(12))
    if not re.fullmatch('[a-f0-9]{24}',namespace):raise RuntimeError('Reading namespace needs review')
    namespace_file.write_text(namespace);os.chmod(namespace_file,0o600);e['environment']['READING_NAMESPACE']=namespace
   else:
    e['environment']['SERVER_METRICS_FILE']='/server-metrics/status.json';volumes=e.setdefault('volumes',[])
    if any(isinstance(v,dict)and v.get('target')=='/server-metrics'for v in volumes):raise RuntimeError('Monitor mount already exists')
    volumes.append({'type':'bind','source':str(MONITOR/'public'),'target':'/server-metrics','read_only':True})
  caddy=Path(s['caddy_path']);text=caddy_candidate(caddy.read_text(),targets['rss.garyhub.uk']['token']);cp=backup/'Caddyfile.integration-new';cp.write_text(text);validate_caddy(cp)
  # Backup PostgreSQL through the running server. SQL and errors remain private.
  dump=backup/'miniflux.dump';backup_database(pg,connection,dump)
  paths={path:file_backup(path,backup)for path in FILES};paths[str(xfile)]=file_backup(xfile,backup)
  s['integrations']={'miniflux':mc,'miniflux_original_compose':(mf['Config'].get('Labels')or{}).get('com.docker.compose.project.config_files',''),'miniflux_version':version,'postgres_image':pg['Image'],'postgres_data_path':postgres_data_path(pg),'database_evidence':verified,'dump_sha':d.sha(dump),'files':paths,'xray_path':str(xfile),'xray_staged':str(staged),'caddy_candidate':str(cp),'applied':False,'access_lock':access['lock'],'collector_config':{'xray_config':str(xfile),'xray_bin':access['xray_bin'],'entitlements':access['entitlements'],'stats_address':'127.0.0.1:10085'}}
  # The empty mount is ready before compose starts the new Lab image.
  MONITOR.mkdir(parents=True,exist_ok=True,mode=0o700);(MONITOR/'public').mkdir(exist_ok=True,mode=0o755)
 def validate(s):
  ext=s['integrations'];slug='garyhub142-reading-check';pg=slug+'-db';mf=slug+'-mf';net=slug+'-net'
  for name in [pg,mf]:
   if not d.run(['docker','inspect',name],False).returncode:raise RuntimeError('An earlier Reading test container needs review')
  d.isolated_step('create Reading test network',['docker','network','create','--internal',net])
  try:
   subnet=','.join(i['Subnet']for i in d.jr(['docker','network','inspect',net])[0]['IPAM']['Config']if i.get('Subnet'))
   d.isolated_step('start synthetic Reading database',['docker','run','-d','--name',pg,'--network',net,'--network-alias','reading-db','--tmpfs',ext['postgres_data_path'],'-e','PGDATA='+ext['postgres_data_path'],'-e','POSTGRES_USER=garyhub_check','-e','POSTGRES_PASSWORD=synthetic-read-check-only','-e','POSTGRES_DB=garyhub_check',ext['postgres_image']])
   for attempt in range(40):
    if not d.run(['docker','exec',pg,'pg_isready','-U','garyhub_check','-d','garyhub_check'],False).returncode:break
    __import__('time').sleep(.5)
   else:raise RuntimeError('Isolated Reading database did not start')
   d.isolated_step('start synthetic Miniflux',['docker','run','-d','--name',mf,'--network',net,'--network-alias','reading-mf','-e','DATABASE_URL=postgres://garyhub_check:synthetic-read-check-only@reading-db:5432/garyhub_check?sslmode=disable','-e','RUN_MIGRATIONS=1','-e','AUTH_PROXY_HEADER=X-GaryHub-User','-e','AUTH_PROXY_USER_CREATION=1','-e','DISABLE_LOCAL_AUTH=1','-e','BASE_URL=https://rss.garyhub.uk','-e','TRUSTED_REVERSE_PROXY_NETWORKS='+subnet,ext['miniflux']['old_image_id']])
   runner=s['services']['calendar-app']['tag']
   for attempt in range(40):
    check=d.run(['docker','run','--rm','--network',net,runner,'node','-e',"fetch('http://reading-mf:8080/healthcheck').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],False)
    if not check.returncode:break
    __import__('time').sleep(.5)
   else:raise RuntimeError('Isolated Miniflux did not start')
   d.isolated_step('miniflux-acceptance.cjs',['docker','run','--rm','--network',net,'-e','CHECK_MINIFLUX_URL=http://reading-mf:8080','-v',str(d.ROOT/'tests')+':/checks:ro',runner,'node','/checks/miniflux-acceptance.cjs'])
   users=d.isolated_step('synthetic Reading account separation',['docker','exec',pg,'psql','-U','garyhub_check','-d','garyhub_check','-Atc',"SELECT count(*) FROM users WHERE username IN ('garyhub-fixture-a','garyhub-fixture-b')"]).stdout.strip()
   if users!=b'2':raise RuntimeError('Miniflux account separation check failed')
  except Exception:
   d.isolated_logs([pg,mf]);raise
  finally:
   d.run(['docker','rm','-fv',mf,pg],False);d.run(['docker','network','rm',net],False)
 def apply(s):
  import fcntl
  ext=s['integrations']
  live_mf=d.image(ext['miniflux']['name'])
  if live_mf['Image']!=ext['miniflux']['old_image_id']or(live_mf['Config'].get('Labels')or{}).get('com.docker.compose.project.config_files','')!=ext['miniflux_original_compose']:raise RuntimeError('Reading changed during preparation')
  with open(ext['access_lock'],'a')as lock:
   fcntl.flock(lock,fcntl.LOCK_EX)
   xfile=Path(ext['xray_path']);info=ext['files'][str(xfile)]
   if d.sha(xfile)!=info['old_sha']:raise RuntimeError('Xray changed during preparation')
   ext['applied']=True;d.write(d.STATE,s)
   for path,source in FILES.items():
    target=Path(path);target.parent.mkdir(parents=True,exist_ok=True)
    content=(json.dumps(ext['collector_config'],indent=2)+'\n').encode()if source is None else(d.ROOT/source).read_bytes();target.write_bytes(content);os.chmod(target,0o600 if source is None else 0o644);ext['files'][path]['new_sha']=d.sha(target)
   xfile.write_bytes(Path(ext['xray_staged']).read_bytes());ext['files'][str(xfile)]['new_sha']=d.sha(xfile);d.write(d.STATE,s)
   d.run(['systemctl','restart','xray']);d.run(['systemctl','is-active','--quiet','xray'])
  d.up(ext['miniflux'])
  ready=False
  for _ in range(30):
   p=d.run(['docker','exec','calendar-app','node','-e',"fetch(process.env.MINIFLUX_URL+'/healthcheck').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"],False)
   if not p.returncode:ready=True;break
   __import__('time').sleep(1)
  if not ready:raise RuntimeError('Reading health failed')
  d.run(['systemctl','daemon-reload']);d.run(['systemctl','enable','--now','garyhub-monitor.timer']);d.run(['systemctl','start','garyhub-monitor.service'])
  snapshot=MONITOR/'public/status.json'
  if not snapshot.is_file()or json.loads(snapshot.read_text()).get('schema')!=1:raise RuntimeError('Host sampler did not produce a valid snapshot')
  if d.sha(s['caddy_path'])!=d.sha(Path(s['backup'])/'Caddyfile'):raise RuntimeError('Caddy changed during integration')
  s['integration_active']={'miniflux':ext['miniflux'],'monitor_config':'/etc/garyhub-monitor.json','monitor_timer':'garyhub-monitor.timer'}
  d.set_caddy(s['caddy_path'],Path(ext['caddy_candidate']).read_text());s['managed_caddy_sha']=d.sha(s['caddy_path']);d.write(d.STATE,s)
 def rollback(s,manual):
  ext=s.get('integrations')
  if not ext or not ext.get('applied'):return
  # Check all integration state before changing any service on rollback.
  current_caddy=d.sha(s['caddy_path']);prior_caddy=d.sha(Path(s['backup'])/'Caddyfile');candidate=Path(ext.get('caddy_candidate','/not-present'))
  if current_caddy not in {prior_caddy,d.sha(candidate)if candidate.is_file()else s.get('managed_caddy_sha')}:raise RuntimeError('Caddy changed independently; rollback needs review')
  for path,info in ext['files'].items():
   if path!=ext['xray_path']and info.get('new_sha')and (not Path(path).is_file() or d.sha(path)!=info['new_sha']):raise RuntimeError('An integration file changed; rollback stopped: '+path)
  mf=ext['miniflux']
  live=d.image(mf['name'])
  if manual and mf['new_config']not in (live['Config'].get('Labels')or{}).get('com.docker.compose.project.config_files','').split(','):raise RuntimeError('Reading Compose changed after this release')
  live_files=(live['Config'].get('Labels')or{}).get('com.docker.compose.project.config_files','')
  if not manual and live_files not in [ext.get('miniflux_original_compose'),mf['new_config']]:raise RuntimeError('Reading configuration changed independently')
  if d.image(mf['name'])['Image']not in [mf['old_image_id'],mf['new_image_id']]:raise RuntimeError('Reading image changed after this release')
  xf=ext['files'][ext['xray_path']];current=json.loads(Path(ext['xray_path']).read_text());original=json.loads(Path(xf['backup']).read_text());installed=json.loads(Path(ext['xray_staged']).read_text())
  if current!=original:restore_xray(current,original,installed)
  d.run(['systemctl','disable','--now','garyhub-monitor.timer'],False);d.run(['systemctl','stop','garyhub-monitor.service'],False)
  d.set_caddy(s['caddy_path'],(Path(s['backup'])/'Caddyfile').read_text())
  import fcntl
  with open(ext['access_lock'],'a')as lock:
   fcntl.flock(lock,fcntl.LOCK_EX)
   for path,info in ext['files'].items():
    if path==ext['xray_path']:
     current=json.loads(Path(path).read_text());old=json.loads(Path(info['backup']).read_text());installed=json.loads(Path(ext['xray_staged']).read_text())
     if current!=old:Path(path).write_text(json.dumps(restore_xray(current,old,installed),indent=2)+'\n')
     continue
    if info['existed']:shutil.copy2(info['backup'],path)
    elif Path(path).exists():Path(path).unlink()
   d.run(['systemctl','daemon-reload']);d.run(['systemctl','restart','xray']);d.run(['systemctl','is-active','--quiet','xray'])
  d.old_up(mf)
  # Keep all current Miniflux/PostgreSQL and monitor data. Only integration config is restored.
  ext['applied']=False;d.write(d.STATE,s)
 d.HOOKS.update(prepare=prepare,validate=validate,apply=apply,rollback=rollback)
