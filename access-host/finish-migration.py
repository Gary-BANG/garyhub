#!/usr/bin/env python3
"""Run only after personally verifying the portal-issued connection works."""
import fcntl,json,os,subprocess,sys
from datetime import datetime,timezone
from pathlib import Path
from reconcile import atomic,execute,desired_clients,PREFIX
os.umask(0o077)
if '--confirmed-working' not in sys.argv:sys.exit('Requires --confirmed-working after testing your portal-issued node.')
s=json.loads(Path('/etc/garyhub-access.json').read_text())
with open(s['lock'],'a') as lock:
    fcntl.flock(lock,fcntl.LOCK_EX)
    x=Path(s['xray_config']);old=x.read_bytes();c=json.loads(old)
    db=json.loads(Path(s['entitlements']).read_text());active=desired_clients(db,datetime.now(timezone.utc).timestamp())
    target=next(i for i in c['inbounds'] if i.get('tag')=='garyhub-access-wss')
    installed={v['id'] for v in target['settings']['clients'] if v.get('email','').startswith(PREFIX)}
    if not any(v['id'] in installed for v in active):sys.exit('No active provisioned personal account; finish the portal test first.')
    old_entries=[i for i in c['inbounds'] if str(i.get('port'))=='8080']
    if len(old_entries)>1:sys.exit('Multiple port-8080 inbounds require review.')
    for i in old_entries:
        if i.get('protocol')!='vless' or i.get('streamSettings',{}).get('network')!='ws' or i.get('streamSettings',{}).get('security') not in (None,'none') or i.get('settings',{}).get('decryption') not in (None,'none') or len(i.get('settings',{}).get('clients',[]))!=1:
            sys.exit('Old inbound differs from the reviewed single-client WS configuration.')
    c['inbounds']=[i for i in c['inbounds'] if i not in old_entries]
    before=len(target['settings']['clients'])
    target['settings']['clients']=[v for v in target['settings']['clients'] if v.get('email')!='garyhub-migration-test']
    if not old_entries and before==len(target['settings']['clients']):
        print('Already finished: old inlet and test credential absent.');sys.exit(0)
    folder=Path('/root/garyhub-access-finish-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ'));folder.mkdir(mode=0o700)
    (folder/'xray-original.json').write_bytes(old)
    staged=x.with_name('.garyhub-finish-candidate.json');atomic(staged,(json.dumps(c,indent=2)+'\n').encode())
    try:
        execute([s['xray_bin'],'run','-test','-config='+str(staged)])
        if x.read_bytes()!=old:raise RuntimeError('Concurrent config update')
        atomic(x,staged.read_bytes())
        try:
            execute(['systemctl','restart','xray']);execute(['systemctl','is-active','--quiet','xray'])
        except Exception:
            atomic(x,old);execute(['systemctl','restart','xray']);raise
        print('DONE: old 8080 inbound and temporary test credential removed. Personal accounts preserved.')
        print('Backup:',folder)
    finally:staged.unlink(missing_ok=True)
