#!/usr/bin/env python3
"""Run actual Node 20 services and browser/HTTP checks on disposable user data."""
import importlib.util,json,os,shutil,socket,subprocess,sys,tempfile,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];HERE=Path(__file__).resolve().parent
NODE=os.environ.get('GARYHUB_TEST_NODE','node')
def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def wait(url,process):
 for _ in range(100):
  if process.poll() is not None:raise RuntimeError('Synthetic service exited')
  try:
   with urllib.request.urlopen(url,timeout=1) as r:
    if r.status==200:return
  except Exception:time.sleep(.1)
 raise RuntimeError('Synthetic health timeout')
def main():
 config=json.loads((HERE.parent/'release-config.json').read_text())
 spec=importlib.util.spec_from_file_location('runtime1431',ROOT/'scripts/updater/deploy_runtime.py');runtime=importlib.util.module_from_spec(spec);spec.loader.exec_module(runtime);runtime.configure(HERE.parent,config)
 for variant in os.environ.get('GARYHUB_VARIANTS','1.3.4.2,1.3.4.1').split(','):
  with tempfile.TemporaryDirectory(prefix='garyhub1431-'+variant+'-') as temp:
   work=Path(temp);cal=ROOT/'calendar-app';lab=ROOT/'lab-service'
   if variant=='1.3.4.1':
    for name in ['calendar-app','lab-service']:shutil.copytree(ROOT/name,work/name,copy_function=os.link,ignore=shutil.ignore_patterns('node_modules','__pycache__'))
    cal=work/'calendar-app';lab=work/'lab-service';(cal/'node_modules').symlink_to(ROOT/'calendar-app/node_modules')
    # Reconstruct the reviewed deployed no-TOTP source, including inherited fixes.
    for release in ['1.4.3.0','1.4.3.1']:
     folder=ROOT/'scripts/releases'/('v'+release)/'variant-overrides'/variant
     for f in folder.rglob('*'):
      if f.is_file():
       dest=work/f.relative_to(folder);dest.unlink();shutil.copyfile(f,dest)
    for name in ['totp-api.js','totp-crypto.js','membership.js']:(cal/name).unlink()
   data=work/'data';data.mkdir();labdata=work/'lab-data';labdata.mkdir();cp,lp=port(),port();checks=work/'checks';checks.mkdir()
   for name,source in config['test_inputs'].items():shutil.copyfile(ROOT/source,checks/name)
   excluded={'NODE_OPTIONS','R2_ACCOUNT_ID','R2_BUCKET','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','MUSIC_CONFIG_FILE','COOKIE_DOMAIN','TRUSTED_ORIGINS','DATA_DIR','APP_DIR','LAB_DATA_DIR'}
   env={**{k:v for k,v in os.environ.items() if k not in excluded},'APP_DIR':str(cal),'DATA_DIR':str(data),'LAB_DATA_DIR':str(labdata),'NODE_PATH':str(ROOT/'calendar-app/node_modules'),'CALENDAR_URL':f'http://127.0.0.1:{cp}','CHECK_CALENDAR':f'http://127.0.0.1:{cp}','CHECK_LAB':f'http://127.0.0.1:{lp}','CHECK_VERSION':config['version'],'COOKIE_SECURE':'false','SESSION_SECRET':'Synthetic-1431-only-session-secret-long-enough','GARYHUB_TOTP_ENCRYPTION_KEY':'ERERERERERERERERERERERERERERERERERERERERERE='}
   translated=lambda service:{k:v.replace('/checks/',str(checks)+'/').replace('http://calendar-check:3000',env['CHECK_CALENDAR']) for k,v in runtime.isolation_environment(service).items()}
   calenv={**env,**translated('calendar-app')};labenv={**{k:v for k,v in env.items() if k not in {'DATA_DIR','APP_DIR','NODE_PATH','GARYHUB_TOTP_ENCRYPTION_KEY'}},**translated('garyhub-lab')}
   assert 'DATA_DIR' not in labenv and 'NODE_OPTIONS' not in labenv
   run=lambda script:subprocess.run([NODE,str(script)],cwd=ROOT,env=calenv,check=True,timeout=240)
   run(checks/'seed.cjs');processes=[];logs=[]
   try:
    for name,source,p,service_env in [('calendar',cal/'app.js',cp,calenv),('lab',lab/'server.cjs',lp,labenv)]:
     log=(work/(name+'.log')).open('w+');logs.append(log);processes.append(subprocess.Popen([NODE,str(source)],env={**service_env,'PORT':str(p)},stdout=log,stderr=log))
    wait(env['CHECK_CALENDAR']+'/health',processes[0]);wait(env['CHECK_LAB']+'/health',processes[1])
    for test in config['isolation_checks']:run(checks/test)
    if os.environ.get('GARYHUB_VERIFY_HTTPS')=='1':subprocess.run([sys.executable,str(HERE/'verify-local.py')],cwd=ROOT,env=calenv,check=True,timeout=120)
    if os.environ.get('GARYHUB_BROWSER')=='1':run(HERE/'browser.cjs')
    for i in range(2):
     result=json.loads(subprocess.check_output([NODE,str(cal/'scripts/publish-hub-release.js'),str(cal/f"releases/garyhub-{config['version']}.json")],env=calenv));assert result['recipients']==5 and bool(result.get('alreadyPublished'))==bool(i)
    print('VARIANT PASS '+variant+': '+config['version']+'; notices recipients=5; repeat publication idempotent.',flush=True)
   except Exception:
    for log in logs:log.flush();log.seek(0);print(log.read()[-2000:])
    raise
   finally:
    for p in processes:
     p.terminate()
     try:p.wait(timeout=5)
     except subprocess.TimeoutExpired:p.kill();p.wait()
    for log in logs:log.close()
if __name__=='__main__':main()
