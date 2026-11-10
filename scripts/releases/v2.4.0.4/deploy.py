"""Verify retained host protections, signed-in stock assets and this release's changes."""
import importlib.util
import json
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_checks.py'
if not source.exists():
    source = ROOT.parent/'v2.3.2.3'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_host_checks', source)
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)
runtime = checks.d
checks.CONFIG = CONFIG
runtime.configure(ROOT, CONFIG)

# v2.4.0.4-r1 stopped in phase 6 with only "Command failed: curl" and rolled back: the shared runtime keeps
# curl responses out of its log, so the failing request could not be identified. Every HTTPS check here and
# in the shared runtime goes through runtime.run, so wrap it for curl only: retry what looks transient right
# after the switch (no connection, timeout, TLS/receive errors, HTTP 429 or 5xx), and name the request when
# it still fails. Only the fixed host and path are reported: no query string, headers or body.
CURL_TRANSIENT_EXIT = {6, 7, 28, 35, 52, 55, 56}
CURL_ATTEMPTS, CURL_PAUSE = 4, 5
_shared_run = runtime.run


def curl_target(args):
    url = next((str(a) for a in args if str(a).startswith('https://')), '')
    return url.split('?', 1)[0].split('#', 1)[0] or 'unknown target'


def checked_run(args, check=True):
    if str(args[0]) != 'curl':
        return _shared_run(args, check)
    for attempt in range(1, CURL_ATTEMPTS + 1):
        result = _shared_run(args, False)
        if result.returncode == 0:
            return result
        found = re.search(rb'returned error: (\d{3})', result.stderr)
        status = int(found.group(1)) if found else None
        transient = result.returncode in CURL_TRANSIENT_EXIT or status == 429 or (status or 0) >= 500
        if not transient or attempt == CURL_ATTEMPTS:
            break
        time.sleep(CURL_PAUSE)
    if not check:
        return result
    raise RuntimeError('HTTPS check failed: ' + curl_target(args) + ' (curl exit ' + str(result.returncode)
                       + (', HTTP ' + str(status) if status else '') + ', ' + str(attempt) + ' attempt'
                       + ('s' if attempt > 1 else '') + ')')


runtime.run = checked_run

# Text that only this release's files contain, checked in the running containers.
RUNNING = {
    'calendar-app': {'/app/assistant-tutor.js': 'grant.busy = true; grant.expires = Date.now() + TTL;',
                     '/app/public/companion/panel.js': 'function armTutor(grant, at)',
                     '/app/assistant-api.js': 'TUTOR_ROUND_TIMEOUT = 105_000'},
    'garyhub-lab': {'/lab/academic.cjs': "verb==='chat'?160000:10000",
                    '/lab/public/companion/panel.js': 'function armTutor(grant, at)'},
}
NEW_TAB = 'href="https://sites.garyhub.uk/" target="_blank" rel="noopener"'


def verify():
    checks.verify()
    host = 'calendar.garyhub.uk'
    for route in ['/stocks/', '/stocks/app.js', '/stocks/charts.js', '/stocks/style.css',
                  '/api/stocks/status', '/api/stocks/search?q=300', '/api/stocks/groups', '/api/stocks/quote?symbol=sz300033',
                  '/api/stocks/intraday?symbol=sz300033', '/api/stocks/financials?symbol=sz300033',
                  '/api/stocks/history?symbol=sz300033']:
        if checks.status(host, route) != b'401':
            raise RuntimeError('Missing stock authentication gate: '+route)
    code = ("const fs=require('fs'),crypto=require('crypto');"
            "for(const [name,hash] of Object.entries(JSON.parse(process.argv[1])))"
            "if(crypto.createHash('sha256').update(fs.readFileSync('/app/stocks/'+name)).digest('hex')!==hash)"
            "throw Error('Stock asset mismatch: '+name)")
    runtime.run(['docker','exec','calendar-app','node','-e',code,json.dumps(CONFIG['stock_asset_sha256'])])
    code = ("const fs=require('fs');"
            "for(const [file,text] of Object.entries(JSON.parse(process.argv[1])))"
            "if(!fs.readFileSync(file,'utf8').includes(text))throw Error('Release change missing: '+file)")
    for service, expected in RUNNING.items():
        if runtime.run(['docker','exec',service,'node','-e',code,json.dumps(expected)], False).returncode:
            raise RuntimeError('Release change missing in running container: '+service)
    if NEW_TAB not in runtime.https('garyhub.uk', '/').decode():
        raise RuntimeError('Homepage Elsewhere link does not open a new tab')


runtime.verify_https = verify
if __name__ == '__main__':
    try:
        runtime.main()
    except Exception as error:
        runtime.say('STOPPED: '+str(error))
        sys.exit(1)
