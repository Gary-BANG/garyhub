#!/usr/bin/env python3
"""Subscription/music adapter; existing 1.4.2 host integrations are inherited."""
import hashlib,importlib.util,json,os,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
runtime=ROOT/'deploy_runtime.py'
if not runtime.is_file():runtime=ROOT.parents[1]/'updater/deploy_runtime.py'
spec=importlib.util.spec_from_file_location('garyhub143_runtime',runtime);d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
CONFIG=json.loads((ROOT/'release-config.json').read_text());d.configure(ROOT,CONFIG)
CONFIG_FILE=Path('/etc/garyhub/music-r2.env')
def prepare(state,configs,lives,backup):
 parent=CONFIG_FILE.parent
 if parent.is_symlink() or CONFIG_FILE.is_symlink():raise RuntimeError('Music configuration symlink requires review')
 if CONFIG_FILE.exists() and not CONFIG_FILE.is_file():raise RuntimeError('Music configuration path is not a regular file')
 parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 if not CONFIG_FILE.exists():
  fd=os.open(CONFIG_FILE,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600);os.close(fd)
 os.chmod(CONFIG_FILE,0o600)
 service=configs['calendar-app']['services'][state['services']['calendar-app']['service']]
 volumes=service.setdefault('volumes',[])
 if any(v.get('target')=='/run/garyhub-music.env' for v in volumes if isinstance(v,dict)):raise RuntimeError('Unexpected existing music mount')
 service.setdefault('environment',{})['MUSIC_CONFIG_FILE']='/run/garyhub-music.env'
 volumes.append({'type':'bind','source':str(CONFIG_FILE),'target':'/run/garyhub-music.env','read_only':True})
 state['music_config_file']=str(CONFIG_FILE)
def verify():
 shared()
 for asset in CONFIG['asset_checksums']:
  if hashlib.sha256(d.https(asset['host'],asset['route']+'?v=1.4.3.0')).hexdigest()!=asset['sha256']:raise RuntimeError('Release asset mismatch: '+asset['route'])
 for host in ['calendar.garyhub.uk','tools.garyhub.uk','garyhub.uk']:
  status=d.run(['curl','--silent','--max-time','20','--resolve',host+':443:127.0.0.1','-o','/dev/null','-w','%{http_code}','https://'+host+'/api/music/selected']).stdout.strip()
  if status!=b'401':raise RuntimeError('Personal music authentication gate failed: '+host)
shared=d.verify_https;d.verify_https=verify;d.HOOKS['prepare']=prepare
if __name__=='__main__':
 try:d.main()
 except Exception as error:d.say('STOPPED: '+str(error));sys.exit(1)
