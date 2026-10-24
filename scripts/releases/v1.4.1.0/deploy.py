#!/usr/bin/env python3
"""Research Dictionary checks around the unchanged backup/cutover/rollback runtime."""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
runtime=ROOT/'deploy_runtime.py'
if not runtime.is_file():runtime=ROOT.parents[1]/'updater/deploy_runtime.py'
spec=importlib.util.spec_from_file_location('research_deployment',runtime)
deployment=importlib.util.module_from_spec(spec);spec.loader.exec_module(deployment)
CONFIG=json.loads((ROOT/'release-config.json').read_text())
deployment.configure(ROOT,CONFIG)
shared_https=deployment.verify_https

def verify_research_https():
    shared_https()
    html=deployment.https('tools.garyhub.uk','/').decode()
    if 'data-tool="research"' not in html or 'https://calendar.garyhub.uk/research/' not in html:
        raise RuntimeError('Research Dictionary Tools link is missing')
    page=deployment.https('calendar.garyhub.uk','/research/').decode()
    if 'data-research-release="1.4.1.0"' not in page:raise RuntimeError('Research Dictionary HTML is stale')
    for asset in CONFIG['asset_checksums']:
        data=deployment.https(asset['host'],asset['route']+'?v=1.4.1.0')
        if hashlib.sha256(data).hexdigest()!=asset['sha256']:raise RuntimeError('Research asset verification failed: '+asset['route'])
    response=deployment.run(['curl','--silent','--max-time','20','--resolve','calendar.garyhub.uk:443:127.0.0.1','-o','/dev/null','-w','%{http_code}','https://calendar.garyhub.uk/api/research'])
    if response.stdout.strip()!=b'401':raise RuntimeError('Research Dictionary authentication check failed')

deployment.verify_https=verify_research_https
if __name__=='__main__':
    try:deployment.main()
    except Exception as error:deployment.say('STOPPED: '+str(error));sys.exit(1)
