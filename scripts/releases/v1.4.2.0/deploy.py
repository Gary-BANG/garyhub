#!/usr/bin/env python3
"""v1.4.2.0 checks and host integrations around the shared checked updater."""
import hashlib,importlib.util,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
runtime=ROOT/'deploy_runtime.py'
if not runtime.is_file():runtime=ROOT.parents[1]/'updater/deploy_runtime.py'
spec=importlib.util.spec_from_file_location('garyhub142_runtime',runtime);d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
CONFIG=json.loads((ROOT/'release-config.json').read_text());d.configure(ROOT,CONFIG)
sys.path.insert(0,str(ROOT))
from integrations import install
install(d)
shared=d.verify_https

def verify():
 shared()
 for asset in CONFIG['asset_checksums']:
  content=d.https(asset['host'],asset['route']+'?v=1.4.2.0')
  if hashlib.sha256(content).hexdigest()!=asset['sha256']:raise RuntimeError('Release asset mismatch: '+asset['route'])
 for host,route,expected in [('tools.garyhub.uk','/api/server-monitor',['401']),('rss.garyhub.uk','/',['302','401']),('files.garyhub.uk','/',['302','401']),('kuma.garyhub.uk','/',['302','401'])]:
  result=d.run(['curl','--silent','--max-time','20','--resolve',host+':443:127.0.0.1','-o','/dev/null','-w','%{http_code}','https://'+host+route])
  if result.stdout.decode().strip()not in expected:raise RuntimeError('Unauthenticated tool gate failed: '+host)
 snapshot=Path('/var/lib/garyhub-monitor/public/status.json')
 if not snapshot.is_file():raise RuntimeError('Server metrics snapshot missing')
 data=json.loads(snapshot.read_text())
 if not data.get('vpn',{}).get('trafficAvailable'):raise RuntimeError('VPN statistics collector is not ready')

d.verify_https=verify
if __name__=='__main__':
 try:d.main()
 except Exception as error:d.say('STOPPED: '+str(error));sys.exit(1)
