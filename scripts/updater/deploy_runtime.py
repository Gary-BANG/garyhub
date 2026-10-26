#!/usr/bin/env python3
"""Shared checked image-overlay deployment. Release adapters supply explicit configuration."""
import base64,fcntl,hashlib,json,os,re,shutil,sqlite3,subprocess,sys,tarfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parent
CONFIG={};VERSION=None;RELEASE=None;REQUIRES=None
STATE=None
ACTIVE=Path('/opt/my-services/garyhub-active-deployment.json')
LOCK=Path('/opt/my-services/.garyhub-privacy-ledger-upgrade.lock')
def configure(root,config):
 global ROOT,CONFIG,VERSION,RELEASE,REQUIRES,STATE
 HOOKS.clear()
 ROOT=Path(root).resolve();CONFIG=dict(config)
 VERSION=CONFIG['version'];REQUIRES=CONFIG['requires_release'];RELEASE='v'+VERSION
 for value in [VERSION,REQUIRES]:
  if not re.fullmatch(r'\d+\.\d+\.\d+\.\d+',value):raise ValueError('Invalid release configuration')
 STATE=ROOT/'deployment-state.json'
HOOKS={}
def hook(name,*args):
 if name in HOOKS:return HOOKS[name](*args)
LOG=None
os.umask(0o077)
def say(s):print(s,flush=True)
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
def source_mismatches(name,directory,baselines):
 mismatches=[]
 for rel,allowed in baselines.items():
  digest=hashlib.sha256((directory/rel).read_bytes().replace(b'\r\n',b'\n').rstrip(b'\n')).hexdigest()
  if digest not in allowed:mismatches.append({'service':name,'file':rel,'normalized_sha256':digest})
 return mismatches
def write(p,v):
 p=Path(p);p.parent.mkdir(parents=True,exist_ok=True);t=p.with_suffix(p.suffix+'.tmp');t.write_text(json.dumps(v,ensure_ascii=False,indent=2));os.chmod(t,0o600);os.replace(t,p)
def run(args,check=True):
 p=subprocess.run([str(a) for a in args],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if LOG:
  private_output=str(args[0])=='curl' or str(args[0])=='docker' and ('inspect' in args or 'compose' in args and 'config' in args)
  LOG.write('[private configuration/response omitted]\n' if private_output else p.stdout.decode(errors='replace')+p.stderr.decode(errors='replace'));LOG.flush()
 if check and p.returncode:raise RuntimeError('Command failed: '+str(args[0])+'. Details remain in the private server log.')
 return p
def jr(args):return json.loads(run(args).stdout)
def safe_diagnostic(result):
 # Never echo command lines, environment, HTTP bodies or arbitrary exception text.
 # These fixed codes and primitive assertion values also work with older Node versions.
 text=(result.stdout+result.stderr).decode(errors='replace')[-16000:];details=[]
 for code in ['ERR_ASSERTION','ERR_INVALID_ARG_TYPE','MODULE_NOT_FOUND','ERR_MODULE_NOT_FOUND','ENOENT','EACCES','ECONNREFUSED','ENOTFOUND','EADDRINUSE','SQLITE_ERROR','SQLITE_BUSY','SQLITE_READONLY','SQLITE_CANTOPEN']:
  if re.search(r'\b'+code+r'\b',text):details.append(code)
 for key in ['actual','expected']:
  found=re.search(r'(?m)^\s*'+key+r':\s*(-?\d+(?:\.\d+)?|true|false|null)\s*,?\s*$',text)
  if found:details.append(key+'='+found[1])
 location=re.search(r'/checks/([A-Za-z0-9_-]+\.cjs:\d+:\d+)',text)
 if location:details.append(location[1])
 for pattern,label in [(r'permission denied','permission denied'),(r'no space left on device','disk full'),(r'network .* already exists','test network already exists'),(r'address already in use|port is already allocated','port occupied'),(r'read-only file system','read-only filesystem'),(r'Cannot find module','module missing'),(r'OCI runtime|failed to create task','container startup failed')]:
  if re.search(pattern,text,re.I):details.append(label)
 return '; '.join(details)
def isolated_step(label,args):
 if LOG:LOG.write('\n[isolated check: '+label+']\n');LOG.flush()
 result=run(args,False)
 if result.returncode:
  detail=safe_diagnostic(result)
  raise RuntimeError('Isolated check failed: '+label+' (exit '+str(result.returncode)+(' / '+detail if detail else '')+').'+(' Private log: '+str(LOG.name) if LOG else ''))
 return result
def isolated_logs(names):
 # Capture logs before disposable containers are removed. Only allowlisted diagnostics
 # reach the console; full logs stay in the existing private execution log.
 for name in names:
  try:
   result=run(['docker','logs','--tail','80',name],False);detail=safe_diagnostic(result)
   if detail:say('    '+name+': '+detail)
  except Exception:pass
def image(name):return jr(['docker','inspect',name])[0]
def up(c):run(['docker','compose','-p',c['project'],'-f',c['new_config'],'up','-d','--no-deps',c['service']])
def old_up(c):run(['docker','compose','-p',c['project'],'-f',c['old_config'],'up','-d','--no-deps',c['service']])
def health(name,new=False):
 code="fetch('http://localhost:3000/health').then(async r=>{if(!r.ok"+("||(await r.json()).hubVersion!=="+json.dumps(VERSION) if new else '')+")throw Error('health')})"
 if new:code+=".then(()=>fetch('http://localhost:3000/privacy-ledger-release.json')).then(async r=>{if(!r.ok||(await r.json()).version!=="+json.dumps(VERSION)+")throw Error('release')})"
 code+=".catch(()=>process.exit(1))"
 for _ in range(35):
  if run(['docker','exec',name,'node','-e',code],False).returncode==0:return
  time.sleep(1)
 raise RuntimeError('Health check failed: '+name)
def snapshot(src,dst):
 if dst.exists():raise RuntimeError('Refusing to overwrite prior backup')
 a=sqlite3.connect('file:'+str(src)+'?mode=ro',uri=True,timeout=30);b=sqlite3.connect(dst)
 try:
  a.backup(b)
  if b.execute('PRAGMA integrity_check').fetchone()[0]!='ok':raise RuntimeError('SQLite backup failed integrity check')
 finally:a.close();b.close()
def compose_config(live,backup):
 labels=live['Config'].get('Labels')or{};project=labels['com.docker.compose.project'];service=labels['com.docker.compose.service'];files=labels['com.docker.compose.project.config_files'].split(',')
 args=['docker','compose','-p',project]
 for f in files:
  if not Path(f).is_file():raise RuntimeError('Active Compose file missing; no service was changed')
  args+=['-f',f]
 config=jr(args+['config','--format','json']);entry=config['services'][service]
 entry['image']=live['Image'];entry['pull_policy']='never';entry.pop('build',None)
 for v in entry.get('volumes',[]):
  if isinstance(v,dict) and v.get('type')=='bind' and not Path(v['source']).is_absolute():raise RuntimeError('Unresolved data mount')
 c={'project':project,'service':service,'name':live['Name'].lstrip('/'),'old_config':str(backup/(service+'-old.json')),'new_config':str(ROOT/(service+'-compose.json')),'old_image_id':live['Image']}
 write(c['old_config'],config);return c,config
def bind(live,destination):
 m=next((m for m in live['Mounts'] if m['Destination']==destination),None)
 if not m or m['Type']!='bind' or not m['RW']:raise RuntimeError('Required data bind missing: '+destination)
 return Path(m['Source'])
def caddy_home(text):
 # Parse braces outside quoted strings and comments; replace only the exact homepage site block.
 matches=list(re.finditer(r'(?m)^garyhub\.uk\s*\{',text))
 if len(matches)!=1:raise RuntimeError('Homepage Caddy block differs from the reviewed structure; no deployment performed')
 start=matches[0].start();pos=matches[0].end()-1;depth=0;quote=None;comment=False;escape=False
 for i in range(pos,len(text)):
  c=text[i]
  if comment:
   if c=='\n':comment=False
   continue
  if quote:
   if escape:escape=False
   elif c=='\\':escape=True
   elif c==quote:quote=None
   continue
  if c=='#':comment=True
  elif c in ['"',"'",'`']:quote=c
  elif c=='{':depth+=1
  elif c=='}':
   depth-=1
   if depth==0:
    return text[:start]+'garyhub.uk {\n    encode zstd gzip\n    @retired path /study/* /api/study/*\n    respond @retired "Gone" 410\n    reverse_proxy garyhub-lab:3000\n}'+text[i+1:]
 raise RuntimeError('Unbalanced homepage Caddy block')
def set_caddy(path,text):
 # Write the mounted inode in place: atomic replace would leave a file bind mount reading the old inode.
 p=Path(path)
 with p.open('w') as f:f.write(text);f.flush();os.fsync(f.fileno())
 run(['docker','exec','caddy','caddy','validate','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
 run(['docker','exec','caddy','caddy','reload','--config','/etc/caddy/Caddyfile','--adapter','caddyfile'])
def backup_lab(data,dest):
 expected={}
 for p in data.rglob('*'):
  if p.is_symlink():raise RuntimeError('Unexpected symlink in Lab data; review before backing up')
  if p.is_file():expected[p.relative_to(data).as_posix()]=sha(p)
 with tarfile.open(dest,'x:gz') as tar:tar.add(data,arcname='lab-data')
 observed={}
 with tarfile.open(dest,'r:gz') as tar:
  for m in tar.getmembers():
   if m.isfile():
    stream=tar.extractfile(m);h=hashlib.sha256()
    for chunk in iter(lambda:stream.read(1024*1024),b''):h.update(chunk)
    observed[str(Path(m.name).relative_to('lab-data'))]=h.hexdigest()
 if expected!=observed:raise RuntimeError('Lab backup byte verification failed')
 return {'files':len(expected),'sha256':sha(dest),'verified':True}
def check_downgrade(file):
 db=sqlite3.connect('file:'+str(file)+'?mode=ro',uri=True,timeout=10)
 try:
  cols={r[1]for r in db.execute('PRAGMA table_info(users)')}
  if 'deletion_pending' in cols and db.execute('SELECT COUNT(*) FROM users WHERE deletion_pending=1').fetchone()[0]:raise RuntimeError('Rollback paused: account deletion is still pending. Complete deletion before downgrading.')
 finally:db.close()
def restore(s,manual=False):
 # Preserve the existing deletion guard when switching application images.
 if s.get('calendar_data'):
  check_downgrade(Path(s['calendar_data'])/'calendar.sqlite')
 if manual:
  for c in s['services'].values():
   if image(c['name'])['Image']!=c['new_image_id']:raise RuntimeError('A service changed after this release; rollback stopped to preserve later work')
  if not ACTIVE.exists() or sha(ACTIVE)!=s.get('active_sha'):raise RuntimeError('Active deployment index changed; rollback needs review')
  if sha(s['caddy_path'])!=s.get('caddy_sha'):raise RuntimeError('Caddy changed after this release; rollback needs review')
 if not manual:
  for c in s['services'].values():
   if image(c['name'])['Image'] not in {c['old_image_id'],c['new_image_id']}:raise RuntimeError('A service changed after the interrupted deployment; automatic rollback stopped to preserve later work')
 hook('rollback',s,manual)
 say('Restoring prior application images; keeping current records and existing credentials...')
 for key in ['calendar-app','garyhub-lab']:old_up(s['services'][key]);health(key)
 # This release never changes Caddy; preserve its current mounted inode and content.
 if s['old_active_exists']:shutil.copy2(Path(s['backup'],'active.json'),ACTIVE)
 elif ACTIVE.exists():ACTIVE.unlink()
 s['status']='rolled-back';write(STATE,s);say('Rollback complete to v'+REQUIRES+'. All current records and credentials were retained.')
def https(host,route):return run(['curl','--silent','--show-error','--fail','--max-time','20','--resolve',host+':443:127.0.0.1','https://'+host+route]).stdout
def verify_https():
 html=https('tools.garyhub.uk','/').decode()
 if '/useful/tool-i18n.js' not in html:raise RuntimeError('Tools language catalog is missing')
 for tool in ['image-eraser','markdown-viewer','pdf-gray']:
  route='/useful/'+tool+'/'
  if ('href="'+route+'"') not in html:raise RuntimeError('Useful tool catalog missing: '+tool)
  headers=run(['curl','--silent','--show-error','--max-time','20','--resolve','tools.garyhub.uk:443:127.0.0.1','-D','-','-o','/dev/null','https://tools.garyhub.uk'+route]).stdout.decode()
  if not re.search(r'(?im)^location: https://calendar\.garyhub\.uk/login/\?next=',headers):raise RuntimeError('Useful tool login gate missing')
 for route in ['/useful/tool-i18n.js','/useful/tool-shell.js','/useful/tool-shell.css','/useful/markdown-viewer/app.js','/useful/markdown-viewer/zip-reader.mjs','/useful/pdf-gray/app.js','/i18n/i18n.js']:
  if not https('tools.garyhub.uk',route):raise RuntimeError('Useful tool asset missing: '+route)
 for host in ['tools.garyhub.uk','calendar.garyhub.uk']:
  if json.loads(https(host,'/privacy-ledger-release.json'))['version']!=VERSION:raise RuntimeError('HTTPS version mismatch')
 for route in ['/api/todos','/api/ledger/categories']:
  p=run(['curl','--silent','--max-time','20','--resolve','calendar.garyhub.uk:443:127.0.0.1','-o','/dev/null','-w','%{http_code}','https://calendar.garyhub.uk'+route])
  if p.stdout.strip()!=b'401':raise RuntimeError('Private record authentication check failed')
 for route in ['/homepage-protected.json','/profile-private.json']:
  p=run(['curl','--silent','--max-time','20','--resolve','garyhub.uk:443:127.0.0.1','-o','/dev/null','-w','%{http_code}','https://garyhub.uk'+route])
  if p.stdout.strip()!=b'404':raise RuntimeError('Unexpected public profile route')
def finish(s):
 say('7/8 Publishing and verifying unread in-site update notices...')
 try:
  release='/app/releases/garyhub-'+VERSION+'.json'
  first=jr(['docker','exec','calendar-app','node','/app/scripts/publish-hub-release.js',release]);again=jr(['docker','exec','calendar-app','node','/app/scripts/publish-hub-release.js',release])
  if not again.get('alreadyPublished') or first['recipients']!=again['recipients']:raise RuntimeError('Notification deduplication verification failed')
  s['publication']=first;s['notification_deduplicated']=True
 except Exception:
  s['status']='notification-pending';write(STATE,s);raise RuntimeError('Both applications are healthy; notification publication is pending. Run the same installer again to retry without redeploying.')
 s['status']='complete';write(STATE,s)
 say('8/8 COMPLETE GaryHub v'+VERSION+'. Update notices verified for '+str(s['publication']['recipients'])+' accounts.')
 say(CONFIG['summary']);say('SOURCE_BASELINE='+s['base_version'])
def check_active(lives):
 if not ACTIVE.is_file():raise RuntimeError('Current active-deployment index is missing; no deployment performed')
 active=json.loads(ACTIVE.read_text())
 for name,live in lives.items():
  entry=active.get('services',{}).get(name,{})
  if entry.get('new_image_id')!=live['Image'] or not Path(entry.get('new_config','/not-found')).is_file():raise RuntimeError('Active deployment index does not match '+name+'; review required')
  files=(live['Config'].get('Labels')or{}).get('com.docker.compose.project.config_files','').split(',')
  if entry['new_config'] not in files:raise RuntimeError('Effective Compose does not match active deployment index')
def backup_totp_key(service,data,backup):
 env=service.get('environment',{})
 if not isinstance(env,dict):raise RuntimeError('Unexpected environment format')
 value=env.get('GARYHUB_TOTP_ENCRYPTION_KEY')
 if not value:raise RuntimeError('Current TOTP encryption key is missing; restore it from the restricted backup before updating')
 try:
  raw=base64.b64decode(value,validate=True)
  if len(raw)!=32 or base64.b64encode(raw).decode()!=value:raise ValueError()
 except Exception:raise RuntimeError('Current TOTP encryption key needs review; no service was changed')
 with sqlite3.connect('file:'+str(data/'calendar.sqlite')+'?mode=ro',uri=True,timeout=10)as db:
  existing={v[0]for v in db.execute('SELECT DISTINCT key_id FROM totp_entries')}
 if existing and existing!={hashlib.sha256(raw).hexdigest()[:16]}:raise RuntimeError('Current TOTP key does not match encrypted entries')
 target=backup/'totp-key.env';fd=os.open(target,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w')as f:f.write('GARYHUB_TOTP_ENCRYPTION_KEY='+value+'\n');f.flush();os.fsync(f.fileno())
def main():
 if os.geteuid()!=0:raise RuntimeError('Run as root on the GaryHub server')
 with open(LOCK,'a')as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  return locked_main()
def isolation_environment(service):
 if service not in {'calendar-app','garyhub-lab'}:raise RuntimeError('Unknown isolated service')
 common=CONFIG.get('isolation_environment',{})
 scoped=CONFIG.get('isolation_service_environment',{})
 if not isinstance(common,dict) or not isinstance(scoped,dict) or set(scoped)-{'calendar-app','garyhub-lab'}:raise RuntimeError('Invalid synthetic service environment')
 for values in [common,*scoped.values()]:
  if not isinstance(values,dict) or any(not isinstance(k,str) or not re.fullmatch(r'[A-Z][A-Z0-9_]*',k) or not isinstance(v,str) for k,v in values.items()):raise RuntimeError('Invalid synthetic environment')
 return {**common,**scoped.get(service,{})}
def validate_apps(services,backup):
 slug='garyhub-v'+VERSION.replace('.','')
 net=slug+'-check';cal=slug+'-calendar-check';lab=slug+'-lab-check'
 testdata=backup/'isolated';testdata.mkdir();labtest=testdata/'lab';labtest.mkdir();tests=ROOT/'tests'
 for name in [cal,lab]:
  if run(['docker','inspect',name],False).returncode==0:raise RuntimeError('An earlier isolated test container exists; inspect before retrying')
 fixture_env={service:[arg for key,value in isolation_environment(service).items() for arg in ['-e',key+'='+value]] for service in ['calendar-app','garyhub-lab']}
 isolated_step('create Calendar/Lab test network',['docker','network','create','--internal',net])
 phase='seed synthetic Calendar database'
 try:
  isolated_step(phase,['docker','run','--rm','--network',net,'-e','DATA_DIR=/app/data','-v',str(testdata)+':/app/data','-v',str(tests)+':/checks:ro',services['calendar-app']['tag'],'node','/checks/seed.cjs'])
  phase='start synthetic Calendar'
  isolated_step(phase,['docker','run','-d','--name',cal,'--network',net,'--network-alias','calendar-check','-e','DATA_DIR=/app/data','-e','SESSION_SECRET=synthetic-isolated-check-long-enough','-e','GARYHUB_TOTP_ENCRYPTION_KEY='+base64.b64encode(bytes([17])*32).decode(),'-e','NODE_ENV=test','-e','COOKIE_SECURE=false',*fixture_env['calendar-app'],'-v',str(testdata)+':/app/data','-v',str(tests)+':/checks:ro',services['calendar-app']['tag']])
  phase='start synthetic Tools/Lab'
  isolated_step(phase,['docker','run','-d','--name',lab,'--network',net,'--network-alias','lab-check','-e','CALENDAR_URL=http://calendar-check:3000','-e','LAB_DATA_DIR=/check-lab',*fixture_env['garyhub-lab'],'-v',str(labtest)+':/check-lab','-v',str(tests)+':/checks:ro',services['garyhub-lab']['tag']])
  phase='Calendar startup health';health(cal,True)
  phase='Tools/Lab startup health';health(lab,True)
  for test in CONFIG['isolation_checks']:
   phase=test
   isolated_step(phase,['docker','exec','-e','CHECK_CALENDAR=http://calendar-check:3000','-e','CHECK_LAB=http://lab-check:3000','-e','CHECK_VERSION='+VERSION,cal,'node','/checks/'+test])
  phase='synthetic database foreign key integrity'
  with sqlite3.connect(testdata/'calendar.sqlite')as db:
   if db.execute('PRAGMA foreign_key_check').fetchall():raise RuntimeError('Isolated foreign key integrity check failed')
  release='/app/releases/garyhub-'+VERSION+'.json'
  phase='synthetic release notice recipients'
  pub=json.loads(isolated_step(phase,['docker','exec',cal,'node','/app/scripts/publish-hub-release.js',release]).stdout)
  phase='synthetic release notice idempotency'
  again=json.loads(isolated_step(phase,['docker','exec',cal,'node','/app/scripts/publish-hub-release.js',release]).stdout)
  if pub.get('recipients')!=5 or not again.get('alreadyPublished') or again.get('recipients')!=5:raise RuntimeError('Isolated notification recipient/deduplication check failed')
 except Exception as error:
  isolated_logs([cal,lab])
  if str(error).startswith('Isolated check failed:'):raise
  raise RuntimeError('Isolated check failed: '+phase+'.'+(' Private log: '+str(LOG.name) if LOG else ''))from error
 finally:run(['docker','rm','-f',lab,cal],False);run(['docker','network','rm',net],False)
def locked_main():
 global LOG
 if STATE.exists():
  s=json.loads(STATE.read_text());LOG=open(Path(s['backup'],'execution.log'),'a')
  if '--rollback' in sys.argv:restore(s,True);return
  if s['status'] in ['complete','notification-pending']:
   for c in s['services'].values():
    if image(c['name'])['Image']!=c['new_image_id']:raise RuntimeError('A service was updated after this release; no changes made')
    health(c['name'],True)
   verify_https()
   if s['status']=='notification-pending':finish(s)
   else:say('Already COMPLETE v'+VERSION+'. No data or notifications were duplicated.');say('SOURCE_BASELINE='+s['base_version'])
   return
  if s['status'] in ['cutover','backing-up']:
   try:restore(s)
   except Exception:s['status']='rollback-failed';write(STATE,s);raise
   raise RuntimeError('An interrupted upgrade was restored. Run the same installer again to retry.')
  if s['status']=='rollback-failed':raise RuntimeError('Prior rollback needs review; inspect private execution log')
 elif '--rollback' in sys.argv:raise RuntimeError('No deployment state exists for this release')
 backup=ROOT/'private-backup'/time.strftime('%Y%m%dT%H%M%SZ',time.gmtime());backup.mkdir(parents=True,mode=0o700,exist_ok=False);LOG=open(backup/'execution.log','a')
 say('1/8 Checking package, reviewed sources and active deployment settings...')
 m=json.loads((ROOT/'manifest.json').read_text())
 if m.get('release')!=RELEASE or m.get('requires_release')!=REQUIRES or m.get('installer_build')!=CONFIG['installer_build']:raise RuntimeError('Release adapter and package manifest disagree')
 for rel,expected in m['files'].items():
  if sha(ROOT/rel)!=expected:raise RuntimeError('Package checksum mismatch: '+rel)
 lives={name:image(name) for name in ['calendar-app','garyhub-lab']};configs={};services={};sources={};mismatches=[]
 versions={}
 for name in lives:
  folder='/app'if name=='calendar-app'else'/lab'
  versions[name]=jr(['docker','exec',name,'node','-e',"console.log(JSON.stringify(require('"+folder+"/public/privacy-ledger-release.json').version))"])
 if len(set(versions.values()))!=1 or next(iter(versions.values()))!=REQUIRES:raise RuntimeError('This package requires both services to be deployed v'+REQUIRES+'; no changes were made')
 base_version='1.3.4.2' if run(['docker','exec','calendar-app','test','-f','/app/totp-api.js'],False).returncode==0 else '1.3.4.1';selected=m['variants'][base_version];m['baselines']=selected['baselines'];m['new_paths']=selected['new_paths']

 for name,live in lives.items():
  if not live['State']['Running']:raise RuntimeError(name+' is not running; diagnose before updating')
  appdir='/app' if name=='calendar-app' else '/lab';out=backup/('source-'+name);out.mkdir();sources[name]=out
  for rel in m['baselines'][name]:
   dest=out/rel;dest.parent.mkdir(parents=True,exist_ok=True);run(['docker','cp',name+':'+appdir+'/'+rel,dest])
  mismatches+=source_mismatches(name,out,m['baselines'][name])
  for rel in m.get('new_paths',{}).get(name,[]):
   if run(['docker','exec',name,'test','!','-e',appdir+'/'+rel],False).returncode:raise RuntimeError('Unexpected existing new-feature source: '+name+'/'+rel)
  if any(v['Destination']==appdir or v['Destination'].startswith(appdir+'/') and v['Destination']!=appdir+'/data' for v in live['Mounts']):raise RuntimeError('Unexpected application source overlay; review required')
  services[name],configs[name]=compose_config(live,backup)
 if mismatches:
  write(ROOT/'compatibility-report.json',{'release':RELEASE,'installer_build':m.get('installer_build'),'status':'source-mismatch','files':mismatches})
  details='; '.join(v['service']+'/'+v['file']+' [SHA256 '+v['normalized_sha256']+']' for v in mismatches)
  raise RuntimeError('Live source differs from the reviewed version: '+details+'. Nothing was deployed. Send this final output for review.')
 caldata=bind(lives['calendar-app'],'/app/data');labdata=bind(lives['garyhub-lab'],'/data')
 env=configs['calendar-app']['services'][services['calendar-app']['service']].get('environment',{})
 if env.get('COOKIE_DOMAIN')!='.garyhub.uk' or str(env.get('COOKIE_SECURE')).lower()!='true':raise RuntimeError('Shared secure login Cookie settings differ from the reviewed deployment; no service changed')
 check_active(lives)
 run(['docker','exec','calendar-app','node','-e',"const m=require('/app/mailer');if(!['graph','smtp'].includes(m.mode()))throw Error('Configure existing mail service before enabling recovery');const k=process.env.EMAIL_CODE_PEPPER||process.env.SESSION_SECRET;if(!k||k.length<24)throw Error('Recovery secret configuration needs review');"])

 if base_version=='1.3.4.2':backup_totp_key(configs['calendar-app']['services'][services['calendar-app']['service']],caldata,backup)
 for name,appdir in [('calendar-app','/app'),('garyhub-lab','/lab')]:
  code="const fs=require('fs');if(JSON.parse(fs.readFileSync('"+appdir+"/public/privacy-ledger-release.json')).version!=="+json.dumps(REQUIRES)+")throw Error('Running release changed during checks');"
  if name=='garyhub-lab':code+="for(const f of ['homepage-protected.json','profile-private.json'])if(!fs.statSync('/lab/'+f).isFile())throw Error('Private profile missing');"
  if run(['docker','exec',name,'node','-e',code],False).returncode:raise RuntimeError('The deployed base changed during checks; no service was changed')
 for private_name in ['homepage-protected.json','profile-private.json']:
  run(['docker','cp','garyhub-lab:/lab/'+private_name,backup/private_name]);os.chmod(backup/private_name,0o600)
 if not (caldata/'calendar.sqlite').is_file():raise RuntimeError('Calendar database missing')
 if shutil.disk_usage(ROOT).free < max(800*1024*1024,sum(p.stat().st_size for p in labdata.rglob('*') if p.is_file())*3):raise RuntimeError('Insufficient free disk for verified backups and image builds')
 caddy=image('caddy');cm=next((v for v in caddy['Mounts'] if v['Destination']=='/etc/caddy/Caddyfile' and v['Type']=='bind'),None)
 if not cm:raise RuntimeError('Expected Caddyfile bind not found')
 caddy_path=Path(cm['Source']);old_caddy=caddy_path.read_text();new_caddy=old_caddy;shutil.copy2(caddy_path,backup/'Caddyfile');(backup/'Caddyfile.new').write_text(new_caddy)
 if ACTIVE.exists():shutil.copy2(ACTIVE,backup/'active.json')
 s={'base_version':base_version,'calendar_data':str(caldata),'release':RELEASE,'version':VERSION,'requires_release':REQUIRES,'status':'prepared','backup':str(backup),'services':services,'caddy_path':str(caddy_path),'old_active_exists':ACTIVE.exists()}
 hook('prepare',s,configs,lives,backup)
 say('2/8 Building on the exact current Calendar and Tools/Lab images, offline...')
 for name in lives:
  appdir='/app' if name=='calendar-app' else '/lab';folder='calendar-app' if name=='calendar-app' else 'lab-service';build=ROOT/('build-'+name);shutil.copytree(ROOT/'payload'/base_version/folder,build/'payload',dirs_exist_ok=True)
  for item in (build/'payload').rglob('*'):
   os.chmod(item,0o755 if item.is_dir()else 0o644)
  extra=''  # Protected fragments and private academic values are inherited intact from the current image.
  (build/'Dockerfile').write_text('ARG BASE_IMAGE\nFROM ${BASE_IMAGE}\nCOPY payload/ '+appdir+'/\n'+extra)
  tag='garyhub-'+name+':'+RELEASE+'-'+base_version;base='garyhub-'+name+'-base:'+RELEASE
  run(['docker','tag',lives[name]['Image'],base]);run(['docker','build','--network=none','--build-arg','BASE_IMAGE='+base,'-t',tag,build]);services[name]['new_image_id']=jr(['docker','image','inspect',tag])[0]['Id'];services[name]['tag']=tag
  configs[name]['services'][services[name]['service']]['image']=tag;write(services[name]['new_config'],configs[name])
 say('3/8 Testing both new applications together with isolated synthetic accounts and data...')
 validate_apps(services,backup)
 hook('validate',s)
 say('4/8 Creating consistent database and byte-verified Lab data backups...')
 for filename in ['calendar.sqlite','sessions.sqlite']:
  if (caldata/filename).exists():snapshot(caldata/filename,backup/filename)
 dry=backup/'migration-check';dry.mkdir(mode=0o700);shutil.copy2(backup/'calendar.sqlite',dry/'calendar.sqlite')
 migration=jr(['docker','run','--rm','--network','none','-e','DATA_DIR=/migration-data','-v',str(dry)+':/migration-data',services['calendar-app']['tag'],'node','/app/scripts/check-v1352-migration.js'])
 if not migration.get('ok'):raise RuntimeError('Existing-record migration verification failed; live data was not changed')
 s['migration_verification']=migration
 s['status']='backing-up';write(STATE,s)
 try:
  run(['docker','stop','garyhub-lab']);s['lab_backup']=backup_lab(labdata,backup/'lab-data.tar.gz')
  s['status']='cutover';write(STATE,s)
  say('5/8 Switching Calendar and Tools/Lab; retaining all current mounts and settings...')
  for name in ['calendar-app','garyhub-lab']:up(services[name]);health(name,True)
  hook('apply',s)
  say('6/8 Validating HTTPS, useful tool assets, login and record authentication...')
  if sha(caddy_path)!=s.get('managed_caddy_sha',sha(backup/'Caddyfile')):raise RuntimeError('Caddy changed while the update was running')
  verify_https()
  active=json.loads((backup/'active.json').read_text()) if s['old_active_exists'] else {'services':{}}
  for name,c in services.items():active.setdefault('services',{})[name]={k:c[k] for k in ['project','service','new_config','old_config','new_image_id']}
  if s.get('integration_active'):active['integrations']=s['integration_active']
  active['previous_release']=active.get('release');active['release']=RELEASE
  for feature in CONFIG['updated_features']:active[feature]=VERSION
  active['source_base_version']=base_version;active['rollback']='python3 '+str(ROOT/'deploy.py')+' --rollback';write(ACTIVE,active);s['active_sha']=sha(ACTIVE);s['caddy_sha']=sha(caddy_path);s['status']='notification-pending';write(STATE,s)
 except Exception:
  try:restore(s)
  except Exception:s['status']='rollback-failed';write(STATE,s);say('Automatic rollback needs attention; inspect the private execution log.')
  raise
 finish(s)
