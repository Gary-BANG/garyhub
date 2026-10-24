#!/usr/bin/env python3
"""Tools Dock adapter: retain shared protections and verify new HTTPS assets."""
import importlib.util
import json
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parent
runtime=ROOT/'deploy_runtime.py'
if not runtime.is_file():runtime=ROOT.parents[1]/'updater/deploy_runtime.py'
spec=importlib.util.spec_from_file_location('garyhub_deployment',runtime)
deployment=importlib.util.module_from_spec(spec);spec.loader.exec_module(deployment)
deployment.configure(ROOT,json.loads((ROOT/'release-config.json').read_text()))
shared_https=deployment.verify_https

def verify_dock_https():
    shared_https()
    html=deployment.https('tools.garyhub.uk','/').decode()
    for marker in ['data-tools-release="1.4.0.0"','id="tool-search"','id="tool-list"','id="tool-detail"','data-view-button="grid"','data-view-button="dock"']:
        if marker not in html:raise RuntimeError('Tools Dock HTTPS markup is incomplete: '+marker)
    for route in ['/tools-catalog.js','/tools-dock.js','/tools-dock.css']:
        if not deployment.https('tools.garyhub.uk',route):raise RuntimeError('Tools Dock HTTPS asset is missing: '+route)

deployment.verify_https=verify_dock_https
if __name__=='__main__':
    try:deployment.main()
    except Exception as error:deployment.say('STOPPED: '+str(error));sys.exit(1)
