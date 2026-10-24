#!/usr/bin/env python3
"""Checked mouse-hover fix using the existing deployment and rollback runtime."""
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
runtime=ROOT/'deploy_runtime.py'
if not runtime.is_file():runtime=ROOT.parents[1]/'updater/deploy_runtime.py'
spec=importlib.util.spec_from_file_location('garyhub_deployment',runtime)
deployment=importlib.util.module_from_spec(spec);spec.loader.exec_module(deployment)
CONFIG=json.loads((ROOT/'release-config.json').read_text())
deployment.configure(ROOT,CONFIG)
shared_https=deployment.verify_https
def verify_hover_https():
    shared_https()
    html=deployment.https('tools.garyhub.uk','/').decode()
    if 'data-tools-release="1.4.0.1"' not in html:raise RuntimeError('Tools hover fix HTML is not current')
    for route,expected in CONFIG['asset_checksums'].items():
        data=deployment.https('tools.garyhub.uk',route+'?v=1.4.0.1')
        if hashlib.sha256(data).hexdigest()!=expected:raise RuntimeError('Tools hover asset verification failed: '+route)
deployment.verify_https=verify_hover_https
if __name__=='__main__':
    try:deployment.main()
    except Exception as error:deployment.say('STOPPED: '+str(error));sys.exit(1)
