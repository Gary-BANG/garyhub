#!/usr/bin/env python3
"""Real Node 20 HTTP checks with isolated data and a synthetic R2 transport."""
import importlib.util,json,os,shutil,socket,subprocess,tempfile,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
HERE=Path(__file__).resolve().parent
NODE=os.environ.get('GARYHUB_TEST_NODE','node')
def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def wait(url,process):
 for _ in range(120):
  if process.poll() is not None:raise RuntimeError('Synthetic service exited')
  try:
   with urllib.request.urlopen(url,timeout=1) as response:
    if response.status==200:return
  except Exception:time.sleep(.1)
 raise RuntimeError('Synthetic health timeout')
def main():
 config=json.loads((HERE.parent/'release-config.json').read_text())
 spec=importlib.util.spec_from_file_location('isolation_runtime',ROOT/'scripts/updater/deploy_runtime.py')
 runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime);runtime.configure(HERE.parent,config)
 for variant in os.environ.get('GARYHUB_VARIANTS','1.3.4.2,1.3.4.1').split(','):
  with tempfile.TemporaryDirectory(prefix='garyhub143-'+variant+'-') as temp:
   work=Path(temp);cal=ROOT/'calendar-app';lab=ROOT/'lab-service'
   if variant=='1.3.4.1':
    for name in ['calendar-app','lab-service']:
     shutil.copytree(ROOT/name,work/name,copy_function=os.link,ignore=shutil.ignore_patterns('node_modules','__pycache__'))
    cal=work/'calendar-app';lab=work/'lab-service';(cal/'node_modules').symlink_to(ROOT/'calendar-app/node_modules')
    for f in (HERE.parent/'variant-overrides'/variant).rglob('*'):
     if f.is_file():
      dest=work/f.relative_to(HERE.parent/'variant-overrides'/variant);dest.unlink();shutil.copyfile(f,dest)
    for name in ['totp-api.js','totp-crypto.js','membership.js']:(cal/name).unlink()
   data=work/'data';data.mkdir();labdata=work/'lab-data';labdata.mkdir();cp,lp=port(),port()
   checks=work/'checks';checks.mkdir()
   for name,source in config['test_inputs'].items():shutil.copyfile(ROOT/source,checks/name)
   excluded={'NODE_OPTIONS','R2_ACCOUNT_ID','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','MUSIC_CONFIG_FILE','COOKIE_DOMAIN','TRUSTED_ORIGINS'}
   env={**{k:v for k,v in os.environ.items() if k not in excluded},'NODE_PATH':str(ROOT/'calendar-app/node_modules'),'APP_DIR':str(cal),'DATA_DIR':str(data),'LAB_DATA_DIR':str(labdata),'CALENDAR_URL':f'http://127.0.0.1:{cp}','CHECK_CALENDAR':f'http://127.0.0.1:{cp}','CHECK_LAB':f'http://127.0.0.1:{lp}','CHECK_VERSION':'1.4.3.0','COOKIE_SECURE':'false','SESSION_SECRET':'Synthetic-143-only-session-secret-long-enough','GARYHUB_TOTP_ENCRYPTION_KEY':'ERERERERERERERERERERERERERERERERERERERERERE='}
   translated=lambda service:{k:v.replace('/checks/',str(checks)+'/').replace('http://calendar-check:3000',env['CHECK_CALENDAR']) for k,v in runtime.isolation_environment(service).items()}
   calendar_env={**env,**translated('calendar-app')}
   lab_env={**{k:v for k,v in env.items() if k not in {'DATA_DIR','APP_DIR','NODE_PATH','GARYHUB_TOTP_ENCRYPTION_KEY'}},**translated('garyhub-lab')}
   assert 'DATA_DIR' not in lab_env and 'NODE_OPTIONS' not in lab_env and not any(k.startswith('R2_') for k in lab_env),'Lab fixture unexpectedly received Calendar-only settings'
   run=lambda script:subprocess.run([NODE,str(script)],cwd=ROOT,env=calendar_env,check=True,timeout=180)
   subprocess.run([NODE,str(checks/'seed.cjs')],cwd=ROOT,env=env,check=True,timeout=180);logs=[];processes=[]
   try:
    for name,source,p in [('calendar',cal/'app.js',cp),('lab',lab/'server.cjs',lp)]:
     log=(work/(name+'.log')).open('w+');logs.append(log);processes.append(subprocess.Popen([NODE,str(source)],env={**(calendar_env if name=='calendar' else lab_env),'PORT':str(p)},stdout=log,stderr=log))
    wait(env['CHECK_CALENDAR']+'/health',processes[0]);wait(env['CHECK_LAB']+'/health',processes[1])
    if os.environ.get('GARYHUB_CHECKS')=='browser':run(HERE/'browser.cjs')
    else:
     for test in config['isolation_checks']:run(checks/test)
     for i in range(2):
      result=json.loads(subprocess.check_output([NODE,str(cal/'scripts/publish-hub-release.js'),str(cal/'releases/garyhub-1.4.3.0.json')],env=calendar_env));assert result['recipients']==5 and bool(result.get('alreadyPublished'))==bool(i)
     print('VARIANT PASS '+variant+': Node 20; notices recipients=5 and idempotency verified.',flush=True)
   except Exception:
    for log in logs:log.flush();log.seek(0);print(log.read()[-3000:])
    raise
   finally:
    for p in processes:
     p.terminate()
     try:p.wait(timeout=5)
     except subprocess.TimeoutExpired:p.kill();p.wait()
    for log in logs:log.close()
if __name__=='__main__':main()
