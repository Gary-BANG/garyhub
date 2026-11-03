#!/usr/bin/env python3
"""Strict v2.0.1.0 overlay for v2.1.0.0: the Elsewhere page on sites.garyhub.uk.

Adds one Caddy site that proxies to the existing Tools/Lab container. DNS must already
point at this server; the Caddy change is validated before cutover, applied after the new
images are healthy and removed again on rollback. Backups, notices and image rollback
reuse the checked shared runtime.
"""
import hashlib,importlib.util,json,re,socket,subprocess,sys,time
from pathlib import Path
from urllib.parse import parse_qs,urlsplit
ROOT=Path(__file__).resolve().parent
runtime=ROOT/'deploy_runtime.py'
if not runtime.is_file():runtime=ROOT.parents[1]/'updater/deploy_runtime.py'
spec=importlib.util.spec_from_file_location('garyhub2100_runtime',runtime);d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
CONFIG=json.loads((ROOT/'release-config.json').read_text());d.configure(ROOT,CONFIG)
shared=d.verify_https
SITE='sites.garyhub.uk'
SITE_BLOCK=SITE+' {\n    encode zstd gzip\n    reverse_proxy garyhub-lab:3000\n}\n'

def addresses(name):
 try:return {info[4][0] for info in socket.getaddrinfo(name,443,socket.AF_INET,socket.SOCK_STREAM)}
 except socket.gaierror:return set()
def local_addresses():
 p=subprocess.run(['hostname','-I'],capture_output=True,text=True)
 return set(p.stdout.split()) if p.returncode==0 else set()
def check_dns():
 # Caddy can only obtain the certificate once public DNS reaches this server.
 site=addresses(SITE);known=addresses('garyhub.uk')|addresses('tools.garyhub.uk')|local_addresses()
 if not site:raise RuntimeError('DNS for '+SITE+' does not exist yet. In Cloudflare add an A record named "sites" with the same IPv4 as garyhub.uk, proxy status DNS only, wait a minute and run RUN-UPDATE again. Nothing was changed')
 if not site<=known:raise RuntimeError('DNS for '+SITE+' points to '+', '.join(sorted(site))+', not to this GaryHub server. Fix the Cloudflare A record (DNS only) and run RUN-UPDATE again. Nothing was changed')
def caddy_with_site(text):
 # Append the site once; an existing definition must be exactly this release's block.
 if re.search(r'(?m)^[^#\n]*\b'+re.escape(SITE)+r'\b',text):
  if SITE_BLOCK in text:return text
  raise RuntimeError('Caddy already defines '+SITE+' differently; review the Caddyfile. Nothing was changed')
 return text.rstrip('\n')+'\n\n'+SITE_BLOCK
def validate_caddy(path):
 target='/tmp/garyhub-v2100-candidate';d.run(['docker','cp',str(path),'caddy:'+target])
 try:d.run(['docker','exec','caddy','caddy','validate','--config',target,'--adapter','caddyfile'])
 finally:d.run(['docker','exec','caddy','rm','-f',target],False)

def prepare(s,configs,lives,backup):
 check_dns()
 candidate=backup/'Caddyfile.sites-new';candidate.write_text(caddy_with_site((backup/'Caddyfile').read_text()));validate_caddy(candidate)
 s['sites_caddy']={'candidate':str(candidate),'applied':False}
def apply(s):
 ext=s['sites_caddy']
 if d.sha(s['caddy_path'])!=d.sha(Path(s['backup'])/'Caddyfile'):raise RuntimeError('Caddy changed during the update')
 d.set_caddy(s['caddy_path'],Path(ext['candidate']).read_text())
 ext.update(applied=True,sha=d.sha(s['caddy_path']));s['managed_caddy_sha']=ext['sha'];d.write(d.STATE,s)
def rollback(s,manual):
 ext=s.get('sites_caddy')
 if not ext or not ext.get('applied'):return
 prior=Path(s['backup'])/'Caddyfile';current=d.sha(s['caddy_path'])
 if current!=d.sha(prior):
  if current!=ext.get('sha'):raise RuntimeError('Caddy changed after this release; rollback needs review')
  d.set_caddy(s['caddy_path'],prior.read_text())
 ext['applied']=False;d.write(d.STATE,s)
d.HOOKS.update(prepare=prepare,apply=apply,rollback=rollback)

def curl_headers(host,route):
 return d.run(['curl','--silent','--show-error','--max-time','20','--resolve',host+':443:127.0.0.1','-D','-','-o','/dev/null','https://'+host+route]).stdout.decode('iso-8859-1')
def status(host,route):
 return d.run(['curl','--silent','--max-time','20','--resolve',host+':443:127.0.0.1','-o','/dev/null','-w','%{http_code}','https://'+host+route]).stdout.strip()
def wait_for_site():
 # The first request after reload may wait for Let's Encrypt; allow a few minutes.
 for _ in range(36):
  p=d.run(['curl','--silent','--max-time','20','--resolve',SITE+':443:127.0.0.1','-o','/dev/null','-w','%{http_code}','https://'+SITE+'/'],False)
  if p.returncode==0 and p.stdout.strip()==b'200':return
  time.sleep(5)
 raise RuntimeError('HTTPS for '+SITE+' did not come up; check that the Cloudflare record is DNS only (grey cloud)')
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
 if not re.search(r'(?im)^cache-control:\s*public, max-age=86400\s*$',curl_headers('tools.garyhub.uk','/companion/pet.js?v='+CONFIG['version'])):raise RuntimeError('Companion asset caching differs from the release')
 for host in ['tools.garyhub.uk','calendar.garyhub.uk']:
  if not re.search(r'(?im)^content-type:\s*image/webp\s*$',curl_headers(host,'/companion/characters/navi/idle.webp?v='+CONFIG['version'])):raise RuntimeError('Character frames are not served as WebP: '+host)
 for route in ['/tools-dock.js','/hub.js','/companion/%2e%2e/tools-dock.js']:
  if status('garyhub.uk',route)!=b'404':raise RuntimeError('Homepage host exposes a Tools file: '+route)
def sites():
 # The Elsewhere host serves only its page, with a strict CSP; /sites/ stays hidden elsewhere.
 # Kept apart from asset_checksums: asset-response.cjs fetches those from Tools without a Host header.
 for asset in CONFIG['sites_asset_checksums']:
  if hashlib.sha256(d.https(SITE,asset['route']+'?v='+CONFIG['version'])).hexdigest()!=asset['sha256']:raise RuntimeError('Release asset mismatch: '+SITE+asset['route'])
 page=d.https(SITE,'/').decode()
 if '/sites.js?v='+CONFIG['version'] not in page or 'https://gary-bang.github.io/ece470-course/' not in page:raise RuntimeError('Elsewhere page content differs from the release')
 headers=curl_headers(SITE,'/')
 if not re.search(r"(?im)^content-security-policy:\s*default-src 'none';",headers):raise RuntimeError('Elsewhere page CSP missing')
 if not re.search(r'(?im)^content-type:\s*image/webp\s*$',curl_headers(SITE,'/thumbs/ece470.webp?v='+CONFIG['version'])):raise RuntimeError('Elsewhere previews are not served as WebP')
 for route in ['/companion/boot.js','/tools-catalog.js','/admin.html','/sites/index.html','/health']:
  if status(SITE,route)!=b'404':raise RuntimeError('Elsewhere host exposes another file: '+route)
 for host in ['tools.garyhub.uk','garyhub.uk']:
  if status(host,'/sites/')!=b'404':raise RuntimeError('Elsewhere files exposed on '+host)
 if 'href="https://sites.garyhub.uk/"' not in d.https('garyhub.uk','/').decode():raise RuntimeError('Homepage Elsewhere link missing')
def verify():
 wait_for_site()
 shared()
 for asset in CONFIG['asset_checksums']:
  if hashlib.sha256(d.https(asset['host'],asset['route']+'?v='+CONFIG['version'])).hexdigest()!=asset['sha256']:raise RuntimeError('Release asset mismatch: '+asset['host']+asset['route'])
 for asset in CONFIG['protected_asset_checksums']:protected_asset(asset)
 companion()
 sites()
 for route in ['/api/academic/state','/api/me']:
  if status('tools.garyhub.uk',route)!=b'401':raise RuntimeError('Study authentication gate failed: '+route)
d.verify_https=verify
if __name__=='__main__':
 try:d.main()
 except Exception as error:d.say('STOPPED: '+str(error));sys.exit(1)
