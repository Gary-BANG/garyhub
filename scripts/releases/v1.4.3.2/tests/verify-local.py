#!/usr/bin/env python3
"""Execute the actual phase-6 verifier against disposable live Node services.

Only endpoint addresses and the Docker file-read location are mapped locally;
curl, HTTP responses, Node hashing and all verification decisions are real.
"""
import hashlib,importlib.util,os,subprocess
from pathlib import Path
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[4]
spec=importlib.util.spec_from_file_location('phase6_1432',ROOT/'scripts/releases/v1.4.3.2/deploy.py')
adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
original=adapter.d.run
def local_run(args,check=True):
 args=[str(v) for v in args]
 if args[0]=='curl':
  result=[];i=0
  while i<len(args):
   if args[i]=='--resolve':i+=2;continue
   value=args[i]
   if value.startswith('https://'):
    url=urlsplit(value);base=os.environ['CHECK_CALENDAR'] if url.hostname=='calendar.garyhub.uk' else os.environ['CHECK_LAB']
    value=base+url.path+('?' + url.query if url.query else '')
   result.append(value);i+=1
  return original(result,check)
 if args[:5]==['docker','exec','garyhub-lab','node','-e']:
  file=Path(os.environ['APP_DIR']).parent/'lab-service'/args[-1].removeprefix('/lab/')
  return subprocess.run([os.environ.get('GARYHUB_TEST_NODE','node'),'-e',args[5],str(file)],capture_output=True,check=check)
 raise AssertionError('Unexpected command in local phase-6 verification')

adapter.d.run=local_run
asset=adapter.CONFIG['protected_asset_checksums'][0]
guest=adapter.d.https(asset['host'],asset['route']+'?v='+adapter.CONFIG['version'])
assert hashlib.sha256(guest).hexdigest()!=asset['sha256'],'The r1 failure was not reproduced'
adapter.verify()
print('PHASE 6 LOCAL PASS: actual verifier, curl responses and Node file hashes; r1 redirect/hash mismatch reproduced.')
