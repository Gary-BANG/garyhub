#!/usr/bin/env python3
"""Local-only entitlement reconciliation. No network management API is exposed."""
import fcntl, json, os, stat, subprocess, sys, tempfile, uuid
from datetime import datetime, timezone
from pathlib import Path

PREFIX='garyhub-managed-'
TAG='garyhub-access-wss'

def desired_clients(db, now):
    if db.get('version')!=1 or not isinstance(db.get('grants'),dict):
        raise ValueError('Invalid entitlement schema')
    result=[]
    for key,g in db['grants'].items():
        uid=g.get('userId')
        if type(uid) is not int or uid<1 or str(uid)!=key: raise ValueError('Invalid user ID')
        if g.get('revoked'):continue
        active=g.get('permanent') is True
        if not active:
            active=datetime.fromisoformat(g['expiresAt'].replace('Z','+00:00')).timestamp()>now
        if active:
            client=str(uuid.UUID(g['clientId']))
            result.append({'id':client,'email':PREFIX+str(uid)})
    return sorted(result,key=lambda c:c['email'])

def merged_config(config,clients):
    matches=[i for i in config.get('inbounds',[]) if i.get('tag')==TAG]
    if len(matches)!=1:raise ValueError('Access inbound not uniquely identified')
    inbound=matches[0]
    stream=inbound.get('streamSettings',{})
    if inbound.get('protocol')!='vless' or stream.get('network')!='ws':raise ValueError('Unexpected transport')
    settings=inbound['settings']
    settings['clients']=[c for c in settings.get('clients',[]) if not c.get('email','').startswith(PREFIX)]+clients
    return config

def atomic(path,content):
    path=Path(path); previous=path.stat() if path.exists() else None
    fd,tmp=tempfile.mkstemp(prefix='.'+path.name,dir=path.parent)
    try:
        if previous:
            os.fchmod(fd,stat.S_IMODE(previous.st_mode));os.fchown(fd,previous.st_uid,previous.st_gid)
        with os.fdopen(fd,'wb') as f:f.write(content);f.flush();os.fsync(f.fileno())
        os.replace(tmp,path)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)

def execute(command):
    result=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=30)
    if result.returncode:raise RuntimeError('Command failed: '+command[0])

def main(config_path='/etc/garyhub-access.json'):
    os.umask(0o077)
    settings=json.loads(Path(config_path).read_text())
    runtime=Path(settings['runtime']);runtime.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    lock=open(settings['lock'],'a')
    fcntl.flock(lock,fcntl.LOCK_EX)
    def publish(ok,clients=None,ws_path='',error=''):
        payload={'ok':ok,'updatedAt':datetime.now(timezone.utc).isoformat(),'host':'vpn.garyhub.uk',
                 'wsPath':ws_path,'clients':clients or {},'error':error}
        atomic(runtime,json.dumps(payload).encode())
    try:
        xfile=Path(settings['xray_config']);old=xfile.read_bytes();config=json.loads(old)
        inbound=next(i for i in config['inbounds'] if i.get('tag')==TAG)
        if inbound.get('listen')!=settings['gateway'] or inbound.get('port')!=18080:
            raise ValueError('Private listener changed')
        ws_path=inbound['streamSettings']['wsSettings']['path']
        healthy=True
        try:
            source=Path(settings['entitlements'])
            db=json.loads(source.read_text()) if source.exists() else {'version':1,'grants':{}}
            desired=desired_clients(db,datetime.now(timezone.utc).timestamp())
        except Exception:
            desired=[];healthy=False # Fail closed: remove managed clients on invalid storage.
        candidate=merged_config(config,desired)
        previous_clients=json.loads(old)['inbounds']
        changed=candidate['inbounds']!=previous_clients
        if changed:
            publish(False,error='updating')
            new=(json.dumps(candidate,ensure_ascii=False,indent=2)+'\n').encode()
            staged=xfile.with_name('.garyhub-access-candidate.json')
            atomic(staged,new)
            try:
                execute([settings['xray_bin'],'run','-test','-config='+str(staged)])
                if xfile.read_bytes()!=old:raise RuntimeError('Concurrent configuration edit')
                atomic(Path(settings['backup']),old)
                atomic(xfile,new)
                try:
                    execute(['systemctl','restart','xray'])
                    execute(['systemctl','is-active','--quiet','xray'])
                except Exception:
                    atomic(xfile,old);execute(['systemctl','restart','xray']);raise
            finally:
                staged.unlink(missing_ok=True)
        execute(['systemctl','is-active','--quiet','xray'])
        mapping={c['email'][len(PREFIX):]:c['id'] for c in desired}
        publish(healthy,mapping,ws_path,'' if healthy else 'invalid_entitlements')
        if not healthy:raise ValueError('Invalid entitlement storage; managed clients removed')
    except Exception as e:
        publish(False,error=type(e).__name__)
        print('Access synchronization failed:',type(e).__name__,file=sys.stderr)
        return 1
    finally:
        lock.close()
    return 0

if __name__=='__main__':sys.exit(main(sys.argv[1] if len(sys.argv)>1 else '/etc/garyhub-access.json'))
