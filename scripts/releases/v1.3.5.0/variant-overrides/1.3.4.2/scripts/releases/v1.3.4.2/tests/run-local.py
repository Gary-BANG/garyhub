"""Run real HTTP/lifecycle checks with synthetic data only. No production access."""
import json,os,shutil,socket,subprocess,tempfile,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];TESTS=Path(__file__).resolve().parent
def port():
 with socket.socket()as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def main():
 work=Path(tempfile.mkdtemp(prefix='garyhub-v1342-'));cal=work/'calendar';labdata=work/'lab-data';runtime=work/'runtime';lab=work/'lab'
 for p in [cal,labdata,runtime]:p.mkdir()
 shutil.copytree(ROOT/'lab-service',lab,ignore=shutil.ignore_patterns('node_modules','.git'))
 fragments={f'{group}-{i}':{'key':group,'html':f'<p>Synthetic {group} {i}</p>'}for i,group in enumerate(['education','education','projects','skills','education','identity','education','identity','identity','identity','identity'])}
 (lab/'homepage-protected.json').write_text(json.dumps(fragments));(lab/'profile-private.json').write_text(json.dumps({'gpa':'3.50','rank':'Synthetic top 10%'}))
 (runtime/'status.json').write_text(json.dumps({'ok':True,'updatedAt':'2020-01-01T00:00:00Z','clients':{'5':'synthetic-client'}}))
 env={**os.environ,'APP_DIR':str(ROOT/'calendar-app'),'DATA_DIR':str(cal),'SESSION_SECRET':'synthetic-check-only','COOKIE_SECURE':'false','COOKIE_DOMAIN':'.garyhub.uk','GARYHUB_TOTP_ENCRYPTION_KEY':'ERERERERERERERERERERERERERERERERERERERERERE='}
 subprocess.run(['node',str(TESTS/'seed.cjs')],env=env,check=True)
 cp,lp=port(),port();env.update(CHECK_CALENDAR=f'http://127.0.0.1:{cp}',CHECK_LAB=f'http://127.0.0.1:{lp}',CHECK_LAB_DATA=str(labdata),CHECK_RUNTIME=str(runtime/'status.json'),CHECK_RESTART_REQUEST=str(runtime/'restart.request'),FX_TEST_URL='http://127.0.0.1:8090/rate',NODE_ENV='test')
 processes=[];logs=[]
 def start(args,e):
  log=open(work/(str(len(logs))+'.log'),'w+');logs.append(log);p=subprocess.Popen(args,env=e,stdout=log,stderr=log);processes.append(p);return p
 def health(base):
  for i in range(100):
   try:
    if urllib.request.urlopen(base+'/health',timeout=1).status==200:return
   except Exception:time.sleep(.1)
  raise RuntimeError('Local fixture did not start: '+str(work))
 try:
  fx=start(['node',str(TESTS/'fx-server.cjs')],env)
  calendar=start(['node',str(ROOT/'calendar-app/app.js')],{**env,'PORT':str(cp)})
  labenv={**env,'PORT':str(lp),'LAB_DATA_DIR':str(labdata),'ACCESS_RUNTIME_FILE':str(runtime/'status.json'),'CALENDAR_URL':env['CHECK_CALENDAR']}
  labprocess=start(['node',str(lab/'server.cjs')],labenv);health(env['CHECK_CALENDAR']);health(env['CHECK_LAB'])
  if os.environ.get('BROWSER_CHECK'):
   subprocess.run(['node',str(TESTS/'browser.cjs')],env={**env,'BROWSER_OUTPUT':str(work/'screenshots')},check=True)
  else:
   for name in ['smoke.cjs','ledger-extra.cjs','features.cjs']:subprocess.run(['node',str(TESTS/name)],env=env,check=True)
   runner=start(['node',str(TESTS/'accounts.cjs')],env);runnerlog=logs[-1];deadline=time.monotonic()+120
   while runner.poll()is None:
    request=runtime/'restart.request'
    if request.exists():
     request.unlink();labprocess.terminate();labprocess.wait(timeout=10);labprocess=start(['node',str(lab/'server.cjs')],labenv);health(env['CHECK_LAB']);(runtime/'restart.request.ready').write_text('ready')
    if time.monotonic()>deadline:raise RuntimeError('Account lifecycle check timed out')
    time.sleep(.1)
   if runner.returncode:
    runnerlog.flush();runnerlog.seek(0);print(runnerlog.read());raise RuntimeError('Account lifecycle check failed')
   runnerlog.flush();runnerlog.seek(0);print(runnerlog.read())
   import sqlite3
   with sqlite3.connect(cal/'calendar.sqlite')as db:
    assert not db.execute('PRAGMA foreign_key_check').fetchall()
    for table in ['totp_entries','totp_grants']:assert db.execute('SELECT count(*) FROM '+table+' WHERE user_id=5').fetchone()[0]==0
    assert db.execute('SELECT count(*) FROM totp_entries WHERE user_id=2').fetchone()[0]==1
   print('INTEGRATION PASS: account deletion cleaned TOTP in both directions; other owner preserved.')
  print('Synthetic verification artifacts: '+str(work))
 finally:
  for p in reversed(processes):
   if p.poll()is None:p.terminate()
  for p in processes:
   try:p.wait(timeout=10)
   except subprocess.TimeoutExpired:p.kill()
  for log in logs:log.close()
if __name__=='__main__':main()
