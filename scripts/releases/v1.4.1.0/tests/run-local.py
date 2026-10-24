#!/usr/bin/env python3
"""Run relevant checks on synthetic data in a shared network namespace, under Node 20."""
import json,os,shutil,socket,subprocess,tempfile,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
NODE=os.environ.get('GARYHUB_TEST_NODE','node')

def port():
    with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def run(args,env):subprocess.run([str(a)for a in args],cwd=ROOT,env=env,check=True)
def wait(url,process):
    for _ in range(100):
        if process.poll() is not None:raise RuntimeError('Fixture server exited')
        try:
            with urllib.request.urlopen(url,timeout=1) as r:
                if r.status==200:return
        except Exception:time.sleep(.1)
    raise RuntimeError('Fixture health timed out')

def main():
    variants=os.environ.get('RESEARCH_VARIANTS','1.3.4.2,1.3.4.1').split(',')
    for variant in variants:
        with tempfile.TemporaryDirectory(prefix='research-'+variant+'-') as tmp:
            work=Path(tmp);cal=ROOT/'calendar-app';lab=ROOT/'lab-service'
            if variant=='1.3.4.1':
                # Hard links are read-only fixtures; unlink a target before replacing an override.
                copy=work/'source';shutil.copytree(ROOT,copy,copy_function=os.link,ignore=shutil.ignore_patterns('.git','node_modules','__pycache__'))
                override=ROOT/'scripts/releases/v1.4.1.0/variant-overrides'/variant
                for f in override.rglob('*'):
                    if f.is_file():
                        target=copy/f.relative_to(override);target.unlink();shutil.copyfile(f,target)
                cal=copy/'calendar-app';lab=copy/'lab-service'
            data=work/'calendar';data.mkdir();labdata=work/'lab';labdata.mkdir()
            env={**os.environ,'DATA_DIR':str(data),'APP_DIR':str(cal),'SESSION_SECRET':'Synthetic-local-research-only-2026-long','COOKIE_SECURE':'false','CHECK_VERSION':'1.4.1.0'}
            run([NODE,ROOT/'scripts/releases/v1.3.6.0/tests/seed.cjs'],env)
            cp,lp=port(),port();env.update(CHECK_CALENDAR=f'http://127.0.0.1:{cp}',CHECK_LAB=f'http://127.0.0.1:{lp}',CALENDAR_URL=f'http://127.0.0.1:{cp}',LAB_DATA_DIR=str(labdata),TRUSTED_ORIGINS='https://garyhub.uk,https://calendar.garyhub.uk,https://tools.garyhub.uk,https://lab.garyhub.uk,'+f'http://127.0.0.1:{cp}')
            logs=[];processes=[]
            try:
                for name,path,p in [('calendar',cal/'app.js',cp),('lab',lab/'server.cjs',lp)]:
                    log=(work/(name+'.log')).open('w+');logs.append(log)
                    processes.append(subprocess.Popen([NODE,str(path)],env={**env,'PORT':str(p)},stdout=log,stderr=log))
                wait(env['CHECK_CALENDAR']+'/health',processes[0]);wait(env['CHECK_LAB']+'/health',processes[1])
                tests=['scripts/releases/v1.4.1.0/tests/research-http.cjs','scripts/releases/v1.3.6.1/tests/useful-http.cjs','scripts/releases/v1.3.6.0/tests/lab-distribution.cjs']
                for test in tests:run([NODE,ROOT/test],env)
                if variant=='1.3.4.2':
                    run([NODE,ROOT/'scripts/releases/v1.4.1.0/tests/research-browser.cjs'],env)
                release=cal/'releases/garyhub-1.4.1.0.json'
                for i in range(2):
                    result=json.loads(subprocess.check_output([NODE,str(cal/'scripts/publish-hub-release.js'),str(release)],env=env))
                    if result.get('recipients')!=5 or bool(result.get('alreadyPublished'))!=bool(i):raise RuntimeError('Notification recipients/idempotency failed')
                print('VARIANT PASS '+variant+': Node 20 HTTP, auth/data, old tool regressions and release recipients=5/idempotency.',flush=True)
            except Exception:
                for log in logs:
                    log.flush();log.seek(0);print(log.read()[-5000:])
                raise
            finally:
                for p in processes:
                    p.terminate()
                    try:p.wait(timeout=5)
                    except subprocess.TimeoutExpired:p.kill();p.wait()
                for log in logs:log.close()
if __name__=='__main__':main()
