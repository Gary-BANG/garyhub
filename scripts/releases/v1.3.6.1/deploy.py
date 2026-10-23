#!/usr/bin/env python3
"""Reviewed v1.3.6.1 adapter for the shared deployment runtime."""
import importlib.util,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parent
runtime=ROOT/'deploy_runtime.py'
if not runtime.is_file():runtime=ROOT.parents[1]/'updater/deploy_runtime.py'
spec=importlib.util.spec_from_file_location('garyhub_deployment',runtime)
deployment=importlib.util.module_from_spec(spec);spec.loader.exec_module(deployment)
deployment.configure(ROOT,json.loads((ROOT/'release-config.json').read_text()))
if __name__=='__main__':
 try:deployment.main()
 except Exception as error:deployment.say('STOPPED: '+str(error));sys.exit(1)
