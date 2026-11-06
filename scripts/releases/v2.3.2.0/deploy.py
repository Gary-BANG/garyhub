#!/usr/bin/env python3
"""Strict v2.3.1.1 overlay: Study Hub navigation, typography and labeled code blocks.
Reuses the reviewed HTTPS checks and shared backup, isolation, switch and rollback runtime.
No schema, host, Caddy, DNS or Compose changes.
"""
import hashlib,importlib.util,json,re,sys
from pathlib import Path
from urllib.parse import parse_qs,urlsplit
ROOT=Path(__file__).resolve().parent
runtime=ROOT/'deploy_runtime.py'
if not runtime.is_file():runtime=ROOT.parents[1]/'updater/deploy_runtime.py'
spec=importlib.util.spec_from_file_location('garyhub2320_runtime',runtime);d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
CONFIG=json.loads((ROOT/'release-config.json').read_text());d.configure(ROOT,CONFIG)
shared=d.verify_https
SITE='sites.garyhub.uk'

def curl_headers(host,route):
 return d.run(['curl','--silent','--show-error','--max-time','20','--resolve',host+':443:127.0.0.1','-D','-','-o','/dev/null','https://'+host+route]).stdout.decode('iso-8859-1')
def status(host,route,method='GET'):
 return d.run(['curl','--silent','--max-time','20','--resolve',host+':443:127.0.0.1','-X',method,'-o','/dev/null','-w','%{http_code}','https://'+host+route]).stdout.strip()
def protected_asset(asset):
 # Protected HTML returns a login redirect without a Cookie, not the file bytes.
 # Check the live image's file and the HTTPS login gate separately.
 route=asset['route']+'?v='+CONFIG['version']
 script="const fs=require('fs'),crypto=require('crypto');process.stdout.write(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))"
 actual=d.run(['docker','exec',asset['service'],'node','-e',script,asset['file']]).stdout.decode().strip()
 if actual!=asset['sha256']:raise RuntimeError('Release asset mismatch in running container: '+asset['route'])
 headers=curl_headers(asset['host'],route)
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
 if not re.search(r'(?im)^cache-control:\s*public, max-age=86400\s*$',curl_headers('tools.garyhub.uk','/companion/assistant.js?v='+CONFIG['version'])):raise RuntimeError('Companion asset caching differs from the release')
 for route in ['/tools-dock.js','/hub.js','/assistant-admin.js','/ai-logs/logs.js','/companion/%2e%2e/tools-dock.js']:
  if status('garyhub.uk',route)!=b'404':raise RuntimeError('Homepage host exposes a Tools file: '+route)
def sites():
 # v2.1.0.0's Elsewhere host keeps serving only its own page.
 for asset in CONFIG['sites_asset_checksums']:
  if hashlib.sha256(d.https(SITE,asset['route']+'?v='+CONFIG['version'])).hexdigest()!=asset['sha256']:raise RuntimeError('Release asset mismatch: '+SITE+asset['route'])
 for route in ['/companion/boot.js','/api/assistant/status','/admin.html','/ai-logs/']:
  if status(SITE,route)!=b'404':raise RuntimeError('Elsewhere host exposes another file: '+route)
def assistant():
 # Every host that shows the companion reaches the assistant only with a signed-in session,
 # and the admin settings, logs and their APIs stay behind the login and admin gates.
 for host in ['garyhub.uk','tools.garyhub.uk','calendar.garyhub.uk']:
  if status(host,'/api/assistant/status')!=b'401':raise RuntimeError('Assistant authentication gate failed: '+host)
 for host in ['tools.garyhub.uk','calendar.garyhub.uk']:
  for route in ['/api/assistant/chat','/api/assistant/memory/clear']:
   if status(host,route,'POST')!=b'403':raise RuntimeError('Assistant origin/CSRF gate failed: '+host+route)
  for route in ['/api/assistant/admin/calls?limit=1','/api/assistant/admin/errors']:
   if status(host,route) not in (b'401',b'403'):raise RuntimeError('AI log API is not protected: '+host+route)
 for route in ['/admin/','/ai-logs/']:
  if status('tools.garyhub.uk',route)!=b'302':raise RuntimeError('Admin page login gate failed: '+route)
 if d.run(['docker','exec','calendar-app','node','-e',"const s=require('fs').readFileSync('/app/assistant-api.js','utf8');process.exit(s.includes('reasoning_effort')&&s.includes('assistant_errors')?0:1)"],False).returncode:raise RuntimeError('Assistant module missing from Calendar')
def verify():
 shared()
 for asset in CONFIG['asset_checksums']:
  if hashlib.sha256(d.https(asset['host'],asset['route']+'?v='+CONFIG['version'])).hexdigest()!=asset['sha256']:raise RuntimeError('Release asset mismatch: '+asset['host']+asset['route'])
 # Admin-only pages use the same container-hash and login-gate check as the member pages.
 for asset in CONFIG['protected_asset_checksums']+CONFIG['admin_asset_checksums']:protected_asset(asset)
 companion()
 sites()
 assistant()
 if status('tools.garyhub.uk','/api/academic/tutor/start','POST')!=b'403':raise RuntimeError('Study consent origin gate failed')
 for route in ['/api/academic/state','/api/me']:
  if status('tools.garyhub.uk',route)!=b'401':raise RuntimeError('Study authentication gate failed: '+route)
d.verify_https=verify
if __name__=='__main__':
 try:d.main()
 except Exception as error:d.say('STOPPED: '+str(error));sys.exit(1)
