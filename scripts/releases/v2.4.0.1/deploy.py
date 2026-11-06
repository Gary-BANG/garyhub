"""Verify retained host protections and this release's signed-in stock assets."""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text())
source = ROOT/'prior_checks.py'
if not source.exists():
    source = ROOT.parent/'v2.3.2.3'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_host_checks', source)
checks = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checks)
runtime = checks.d
checks.CONFIG = CONFIG
runtime.configure(ROOT, CONFIG)


def verify():
    checks.verify()
    host = 'calendar.garyhub.uk'
    for route in ['/stocks/', '/stocks/app.js', '/stocks/charts.js', '/stocks/style.css',
                  '/api/stocks/groups', '/api/stocks/quote?symbol=sz300033',
                  '/api/stocks/intraday?symbol=sz300033', '/api/stocks/financials?symbol=sz300033',
                  '/api/stocks/history?symbol=sz300033']:
        if checks.status(host, route) != b'401':
            raise RuntimeError('Missing stock authentication gate: '+route)
    code = ("const fs=require('fs'),crypto=require('crypto');"
            "for(const [name,hash] of Object.entries(JSON.parse(process.argv[1])))"
            "if(crypto.createHash('sha256').update(fs.readFileSync('/app/stocks/'+name)).digest('hex')!==hash)"
            "throw Error('Stock asset mismatch: '+name)")
    runtime.run(['docker','exec','calendar-app','node','-e',code,json.dumps(CONFIG['stock_asset_sha256'])])


runtime.verify_https = verify
if __name__ == '__main__':
    try:
        runtime.main()
    except Exception as error:
        runtime.say('STOPPED: '+str(error))
        sys.exit(1)
