"""Reuse the reviewed deployment chain and check the current, served picker UI."""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / 'release-config.json').read_text(encoding='utf-8'))
# The v2.4.4.0 terminal check pins a literal ?v=2.4.4.0. Retain its database check below and
# build on the same preceding verifier, which covers actual services, assets and Caddy.
source = ROOT / 'prior_0434.py'
if not source.exists():
    source = ROOT.parent / 'v2.4.3.4' / 'deploy.py'
spec = importlib.util.spec_from_file_location('picker_previous', source)
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
checks, runtime = prior.checks, prior.runtime
module = prior
while module is not None:
    module.CONFIG = CONFIG
    module = getattr(module, 'prior', None)
checks.CONFIG = CONFIG
prepare_caddy = runtime.HOOKS['prepare']
runtime.configure(ROOT, CONFIG)
runtime.HOOKS.update(prepare=prepare_caddy)


def verify():
    prior.verify()
    script = """const fs=require('node:fs');
    if(!fs.readFileSync('/app/site-navigator.js','utf8').includes('site_permission_incidents'))process.exit(1);
    const db=require('/app/db');
    db.all("SELECT name FROM sqlite_master WHERE name IN ('site_bookmarks','site_permission_incidents')").then(rows=>{
      db.db.close(); if(rows.length!==2)process.exitCode=1;
    }).catch(()=>process.exit(1))"""
    runtime.run(['docker', 'exec', 'calendar-app', 'node', '-e', script])
    html = runtime.https('tools.garyhub.uk', '/useful/site-navigator/?v=' + CONFIG['version'])
    markers = [('navigator.mjs?v=' + CONFIG['version']).encode(), b'id="basic-choice"', b'id="file"', b'id="folder"']
    if not all(marker in html for marker in markers):
        raise RuntimeError('Personal site navigator picker is missing from the served page')


runtime.verify_https = verify
if __name__ == '__main__':
    try:
        runtime.main()
    except Exception as error:
        runtime.say('STOPPED: ' + str(error))
        sys.exit(1)
