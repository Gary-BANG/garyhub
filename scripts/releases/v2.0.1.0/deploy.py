#!/usr/bin/env python3
"""Strict v2.0.0.0 overlay for the v2.0.1.0 companion characters; reuse checked backup, rollback and notice runtime."""
import hashlib,importlib.util,json,re,sys
from pathlib import Path
from urllib.parse import parse_qs,urlsplit
ROOT=Path(__file__).resolve().parent
runtime=ROOT/'deploy_runtime.py'
if not runtime.is_file():runtime=ROOT.parents[1]/'updater/deploy_runtime.py'
spec=importlib.util.spec_from_file_location('garyhub2010_runtime',runtime);d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
CONFIG=json.loads((ROOT/'release-config.json').read_text());d.configure(ROOT,CONFIG)
shared=d.verify_https
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
def companion():
 # The companion loads on public pages of every host, versioned assets may be cached,
 # and the homepage host still hides everything outside its own list.
 tag=lambda scope:'<script src="/companion/boot.js?v='+CONFIG['version']+'" defer data-companion="'+scope+'"></script>'
 if tag('open') not in d.https('garyhub.uk','/').decode():raise RuntimeError('Homepage companion tag missing')
 if tag('quiet') not in d.https('calendar.garyhub.uk','/ledger/').decode():raise RuntimeError('Calendar companion tag missing')
 headers=d.run(['curl','--silent','--show-error','--fail','--max-time','20','--resolve','tools.garyhub.uk:443:127.0.0.1','-D','-','-o','/dev/null','https://tools.garyhub.uk/companion/pet.js?v='+CONFIG['version']]).stdout.decode('iso-8859-1')
 if not re.search(r'(?im)^cache-control:\s*public, max-age=86400\s*$',headers):raise RuntimeError('Companion asset caching differs from the release')
 # Character frames cut from the Step 1c sheets are WebP; both services must label them as images.
 for host in ['tools.garyhub.uk','calendar.garyhub.uk']:
  headers=d.run(['curl','--silent','--show-error','--fail','--max-time','20','--resolve',host+':443:127.0.0.1','-D','-','-o','/dev/null','https://'+host+'/companion/characters/navi/idle.webp?v='+CONFIG['version']]).stdout.decode('iso-8859-1')
  if not re.search(r'(?im)^content-type:\s*image/webp\s*$',headers):raise RuntimeError('Character frames are not served as WebP: '+host)
 for route in ['/tools-dock.js','/hub.js','/companion/%2e%2e/tools-dock.js']:
  status=d.run(['curl','--silent','--max-time','20','--resolve','garyhub.uk:443:127.0.0.1','-o','/dev/null','-w','%{http_code}','https://garyhub.uk'+route]).stdout.strip()
  if status!=b'404':raise RuntimeError('Homepage host exposes a Tools file: '+route)
def verify():
 shared()
 for asset in CONFIG['asset_checksums']:
  if hashlib.sha256(d.https(asset['host'],asset['route']+'?v='+CONFIG['version'])).hexdigest()!=asset['sha256']:raise RuntimeError('Release asset mismatch: '+asset['host']+asset['route'])
 for asset in CONFIG['protected_asset_checksums']:protected_asset(asset)
 companion()
 for route in ['/api/academic/state','/api/me']:
  status=d.run(['curl','--silent','--max-time','20','--resolve','tools.garyhub.uk:443:127.0.0.1','-o','/dev/null','-w','%{http_code}','https://tools.garyhub.uk'+route]).stdout.strip()
  if status!=b'401':raise RuntimeError('Study authentication gate failed: '+route)
d.verify_https=verify
if __name__=='__main__':
 try:d.main()
 except Exception as error:d.say('STOPPED: '+str(error));sys.exit(1)
