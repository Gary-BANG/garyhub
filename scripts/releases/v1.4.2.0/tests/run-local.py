#!/usr/bin/env python3
"""Two real Node 20 services on synthetic data, for each supported capability variant."""
import json,os,shutil,socket,subprocess,tempfile,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
NODE=os.environ.get('GARYHUB_TEST_NODE','node')
CONFIG=json.loads(Path(os.environ.get('GARYHUB_ISOLATION_CONFIG',ROOT/'scripts/releases/v1.4.2.0/release-config.json')).read_text())
def port():
 with socket.socket()as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def wait(url,p):
 for _ in range(100):
  if p.poll()is not None:raise RuntimeError('Fixture process exited')
  try:
   with urllib.request.urlopen(url,timeout=1)as r:
    if r.status==200:return
  except Exception:time.sleep(.1)
 raise RuntimeError('Fixture health timeout')
def main():
 for variant in os.environ.get('GARYHUB_VARIANTS','1.3.4.2,1.3.4.1').split(','):
  with tempfile.TemporaryDirectory(prefix='garyhub142-'+variant+'-')as temp:
   work=Path(temp);cal=ROOT/'calendar-app';lab=ROOT/'lab-service'
   if variant=='1.3.4.1':
    copy=work/'source';shutil.copytree(ROOT,copy,copy_function=os.link,ignore=shutil.ignore_patterns('.git','node_modules','__pycache__'))
    for f in (ROOT/'scripts/releases/v1.4.2.0/variant-overrides'/variant).rglob('*'):
     if f.is_file():
      target=copy/f.relative_to(ROOT/'scripts/releases/v1.4.2.0/variant-overrides'/variant);target.unlink();shutil.copyfile(f,target)
    cal=copy/'calendar-app';lab=copy/'lab-service'
   data=work/'calendar';data.mkdir();labdata=work/'lab';labdata.mkdir();cp,lp,mp=port(),port(),port()
   # Use the installer's synthetic environment, translating only container paths/addresses.
   fixture={k:v.replace('http://calendar-check:3000',f'http://127.0.0.1:{cp}').replace('http://calendar-check:18100',f'http://127.0.0.1:{mp}').replace('/checks/monitor-fixture.json',str(ROOT/'scripts/releases/v1.4.2.0/tests/monitor-fixture.json'))for k,v in CONFIG.get('isolation_environment',{}).items()}
   inherited={k:v for k,v in os.environ.items()if k not in {'TRUSTED_ORIGINS','READING_NAMESPACE','MINIFLUX_URL','SERVER_METRICS_FILE','COOKIE_DOMAIN'}}
   env={**inherited,'NODE_PATH':str(ROOT/'calendar-app/node_modules'),'DATA_DIR':str(data),'APP_DIR':str(cal),'SESSION_SECRET':'Synthetic-garyhub-142-local-fixture-only','COOKIE_SECURE':'false','CHECK_VERSION':CONFIG['version'],'CHECK_CALENDAR':f'http://127.0.0.1:{cp}','CHECK_LAB':f'http://127.0.0.1:{lp}','CALENDAR_URL':f'http://127.0.0.1:{cp}','LAB_DATA_DIR':str(labdata),**fixture}
   run=lambda *args:subprocess.run([str(a)for a in args],cwd=ROOT,env=env,check=True,timeout=100)
   run(NODE,ROOT/'scripts/releases/v1.3.6.0/tests/seed.cjs');logs=[];processes=[]
   if os.environ.get('GARYHUB_CHECKS')=='browser':
    import sqlite3
    with sqlite3.connect(data/'calendar.sqlite')as conn:conn.execute("UPDATE users SET account_tier='subscriber' WHERE id=3")
   try:
    for name,path,p in [('calendar',cal/'app.js',cp),('lab',lab/'server.cjs',lp)]:
     log=(work/(name+'.log')).open('w+');logs.append(log);processes.append(subprocess.Popen([NODE,str(path)],env={**env,'PORT':str(p)},stdout=log,stderr=log))
    wait(env['CHECK_CALENDAR']+'/health',processes[0]);wait(env['CHECK_LAB']+'/health',processes[1])
    for test in ([]if os.environ.get('GARYHUB_CHECKS')=='browser'else['scripts/releases/v1.4.2.0/tests/features-http.cjs','scripts/releases/v1.4.1.0/tests/research-http.cjs','scripts/releases/v1.3.6.1/tests/useful-http.cjs']):
     run(NODE,ROOT/test)
    if os.environ.get('GARYHUB_BROWSER')=='1'and variant=='1.3.4.2':run(NODE,ROOT/'scripts/releases/v1.4.2.0/tests/browser.cjs')
    for i in range(2):
     result=json.loads(subprocess.check_output([NODE,str(cal/'scripts/publish-hub-release.js'),str(cal/'releases/garyhub-1.4.2.0.json')],env=env));assert result['recipients']==5 and bool(result.get('alreadyPublished'))==bool(i)
    print('VARIANT PASS '+variant+': Node 20, HTTP identity/data isolation, regressions, notices recipients=5 and deduplication.',flush=True)
   except Exception:
    for log in logs:log.flush();log.seek(0);print(log.read()[-3500:])
    raise
   finally:
    for p in processes:
     p.terminate()
     try:p.wait(timeout=5)
     except subprocess.TimeoutExpired:p.kill();p.wait()
    for log in logs:log.close()
if __name__=='__main__':main()
