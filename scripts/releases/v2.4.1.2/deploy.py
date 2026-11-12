"""v2.4.1.2: code blocks in Study Q&A replies keep their lines.

The tutor rule `.tutoring pre{white-space:pre-wrap;overflow-wrap:anywhere}` wrapped code blocks at any character, so
ASCII diagrams and register layouts broke apart on phones. Code blocks now use white-space:pre and scroll sideways
inside the bubble. Only panel.css (both copies) and version references change.

Reuses the v2.4.1.1 adapter (its panel.css formula checks, and through it v2.4.1.0/v2.4.0.4 checks and the curl
retry). Like v2.4.1.1 it builds FROM the running image, so the private developer profile is inherited and not shipped.
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_0411.py'
if not source.exists():
    source = ROOT.parent/'v2.4.1.1'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_0411_checks', source)
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
checks, runtime = prior.checks, prior.runtime
# The earlier modules configured themselves from the file next to them; point everything at this release.
prior.CONFIG = prior.prior.CONFIG = prior.prior.prior.CONFIG = checks.CONFIG = CONFIG
runtime.configure(ROOT, CONFIG)

CODE = ('.tutoring .msg>.text pre{max-width:100%;overflow-x:auto;white-space:pre;overflow-wrap:normal;word-break:normal;'
        'line-height:1.45;background:var(--paper);padding:10px;border-radius:8px}')
STALE = '.tutoring pre{white-space:pre-wrap'
RUNNING = {'calendar-app': {'/app/public/companion/panel.css': CODE},
           'garyhub-lab': {'/lab/public/companion/panel.css': CODE}}


def verify():
    prior.verify()
    for host in ['tools.garyhub.uk', 'garyhub.uk', 'calendar.garyhub.uk']:
        css = runtime.https(host, '/companion/panel.css?v='+CONFIG['version']).decode()
        if CODE not in css or STALE in css:
            raise RuntimeError('Companion code blocks still wrap: '+host)
    code = ("const fs=require('fs');"
            "for(const [file,text] of Object.entries(JSON.parse(process.argv[1])))"
            "if(!fs.readFileSync(file,'utf8').includes(text))throw Error('Release change missing: '+file)")
    for service, expected in RUNNING.items():
        if runtime.run(['docker', 'exec', service, 'node', '-e', code, json.dumps(expected)], False).returncode:
            raise RuntimeError('Release change missing in running container: '+service)


runtime.verify_https = verify
if __name__ == '__main__':
    try:
        runtime.main()
    except Exception as error:
        runtime.say('STOPPED: '+str(error))
        sys.exit(1)
