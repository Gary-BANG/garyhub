#!/usr/bin/env python3
"""Invoked over the existing SSH connection by Setup-R2.ps1; never log input."""
import base64,fcntl,json,os,re,subprocess,sys
from pathlib import Path
CONFIG_FILE=Path('/etc/garyhub/music-r2.env')
ACTIVE_FILE=Path('/opt/my-services/garyhub-active-deployment.json')
LOCK_FILE=Path('/opt/my-services/.garyhub-privacy-ledger-upgrade.lock')
def configure(value):
 if os.geteuid()!=0:raise RuntimeError('Run as root')
 patterns={'R2_ACCOUNT_ID':r'[a-f0-9]{32}','R2_BUCKET':r'[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]','R2_ACCESS_KEY_ID':r'[a-f0-9]{32}','R2_SECRET_ACCESS_KEY':r'[a-f0-9]{64}'}
 if set(value)!=set(patterns) or any(not isinstance(value[k],str) or not re.fullmatch(p,value[k]) for k,p in patterns.items()):raise RuntimeError('R2 fields are incomplete or invalid')
 with open(LOCK_FILE,'a') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  result=subprocess.run(['docker','exec','calendar-app','node','-e',"process.stdout.write(require('/app/public/privacy-ledger-release.json').version)"],capture_output=True)
  if result.returncode or result.stdout!=b'1.4.3.0':raise RuntimeError('Install v1.4.3.0 successfully before configuring R2')
  active=json.loads(ACTIVE_FILE.read_text())
  inspect=json.loads(subprocess.check_output(['docker','inspect','calendar-app']))[0]
  if inspect['Image']!=active['services']['calendar-app']['new_image_id']:raise RuntimeError('Active deployment differs from the running image')
  target=CONFIG_FILE
  if target.is_symlink() or target.parent.is_symlink() or not target.is_file():raise RuntimeError('Expected private music configuration file is missing')
  if not any(v['Source']==str(target) and v['Destination']=='/run/garyhub-music.env' and not v['RW'] for v in inspect['Mounts']):raise RuntimeError('Expected read-only music configuration mount is missing')
  previous=target.read_bytes();old=dict(line.split('=',1) for line in previous.decode().splitlines() if '=' in line)
  changed=any(old.get(k)!=value[k] for k in ['R2_ACCOUNT_ID','R2_BUCKET'])
  if old and changed:
   check=subprocess.run(['docker','exec','calendar-app','node','-e',"const db=require('/app/db');Promise.all([db.get('SELECT COUNT(*) AS n FROM music_tracks'),db.get('SELECT COUNT(*) AS n FROM music_delete_jobs')]).then(r=>{console.log(r.reduce((s,x)=>s+x.n,0));db.db.close()}).catch(()=>process.exit(1))"],capture_output=True)
   if check.returncode or int(check.stdout.strip())!=0:raise RuntimeError('Existing music is tied to its current account/bucket; migrate it before changing storage')
  def write(data):
   # Preserve the inode mounted into Docker. Never atomically replace this file.
   with target.open('wb') as f:f.write(data);f.flush();os.fsync(f.fileno())
   os.chmod(target,0o600)
  try:
   write(('\n'.join(k+'='+value[k] for k in patterns)+'\n').encode())
   test=subprocess.run(['docker','exec','calendar-app','node','/app/scripts/check-music-storage.js'],capture_output=True,timeout=180)
   if test.returncode:raise RuntimeError('R2 write/read/delete check failed; previous configuration was restored. Review bucket permissions and server connectivity')
  except BaseException:write(previous);raise
  print('R2 READY: credentials saved privately; object write/read/delete verified. Refresh Music Library. No restart required.')
if __name__=='__main__':
 try:configure(json.loads(base64.b64decode('CONFIG_JSON_B64')))
 except Exception as error:print('STOPPED: '+str(error));sys.exit(1)
