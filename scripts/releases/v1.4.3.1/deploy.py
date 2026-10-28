#!/usr/bin/env python3
"""Read-only UI overlay; inherit the live music, Reading and VPN integrations."""
import hashlib,importlib.util,json,re,sys
from pathlib import Path
from urllib.parse import parse_qs,urlsplit
ROOT=Path(__file__).resolve().parent
runtime=ROOT/'deploy_runtime.py'
if not runtime.is_file():runtime=ROOT.parents[1]/'updater/deploy_runtime.py'
spec=importlib.util.spec_from_file_location('garyhub1431_runtime',runtime);d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
CONFIG=json.loads((ROOT/'release-config.json').read_text());d.configure(ROOT,CONFIG)
shared=d.verify_https
recovery_spec=importlib.util.spec_from_file_location('garyhub1431_recovery',ROOT/'rollback_recovery.py')
recovery=importlib.util.module_from_spec(recovery_spec);recovery_spec.loader.exec_module(recovery)
d.HOOKS['reconcile_active']=lambda lives:recovery.reconcile(d,lives,CONFIG['rollback_recovery'])
def protected_asset(asset):
 # Protected HTML returns a login redirect without a Cookie, not the file bytes.
 # Check the live image's file and the HTTPS login gate separately.
 route=asset['route']+'?v='+CONFIG['version']
 script="const fs=require('fs'),crypto=require('crypto');process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))"
 actual=d.run(['docker','exec',asset['service'],'node','-e',script,asset['file']]).stdout.decode().strip()
 if actual!=asset['sha256']:raise RuntimeError('Release asset mismatch in running container: '+asset['route'])
 headers=d.run(['curl','--silent','--show-error','--max-time','20','--resolve',asset['host']+':443:127.0.0.1','-D','-','-o','/dev/null','https://'+asset['host']+route]).stdout.decode('iso-8859-1')
 statuses=re.findall(r'(?im)^HTTP/[\d.]+\s+(\d{3})',headers)
 locations=re.findall(r'(?im)^location:\s*([^\r\n]+)',headers)
 login=urlsplit(locations[-1].strip() if locations else '')
 expected='https://'+asset['host']+asset['route'].removesuffix('index.html')+'?v='+CONFIG['version']
 if not statuses or statuses[-1]!='302' or login.scheme!='https' or login.netloc!='calendar.garyhub.uk' or login.path!='/login/' or parse_qs(login.query)!={'next':[expected]}:
  raise RuntimeError('Protected page login gate failed: '+asset['route'])
def verify():
 shared()
 for asset in CONFIG['asset_checksums']:
  if hashlib.sha256(d.https(asset['host'],asset['route']+'?v='+CONFIG['version'])).hexdigest()!=asset['sha256']:raise RuntimeError('Release asset mismatch: '+asset['route'])
 for asset in CONFIG['protected_asset_checksums']:protected_asset(asset)
 for route in ['/api/academic/state','/api/me']:
  status=d.run(['curl','--silent','--max-time','20','--resolve','tools.garyhub.uk:443:127.0.0.1','-o','/dev/null','-w','%{http_code}','https://tools.garyhub.uk'+route]).stdout.strip()
  if status!=b'401':raise RuntimeError('Study authentication gate failed: '+route)
d.verify_https=verify
if __name__=='__main__':
 try:d.main()
 except Exception as error:d.say('STOPPED: '+str(error));sys.exit(1)
