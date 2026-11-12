"""v2.4.1.1: formulas in Study Q&A replies render on one line again.

KaTeX names the spans of \\text{} and \\texttt{} "text", and the companion bubble rules (.msg .text) matched them,
so every text run inside a formula got bubble padding and wrapped almost one character per line. Bubble rules now
use .msg>.text; wide display formulas scroll sideways. Only panel.css (both copies) and version references change.

Reuses the v2.4.1.0 adapter (and through it v2.4.0.4's checks and curl retry). v2.4.1.0 staged the private
developer profile into the payload; this release builds FROM the running v2.4.1.0 image, which already holds
/lab/developer-profile.json, so the package carries no private file and that prepare hook is not used. The
inherited verify still confirms the running Tools/Lab container has the profile.
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_0410.py'
if not source.exists():
    source = ROOT.parent/'v2.4.1.0'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_0410_checks', source)
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
checks, runtime = prior.checks, prior.runtime
# The earlier modules configured themselves from the file next to them; point everything at this release.
prior.CONFIG = prior.prior.CONFIG = checks.CONFIG = CONFIG
runtime.configure(ROOT, CONFIG)
runtime.HOOKS.pop('prepare', None)

# Bubble rules apply to the bubble element only, so KaTeX's own .text spans keep their layout.
FIXED = '.msg>.text{margin:0;padding:8px 12px;border-radius:14px;white-space:pre-wrap;overflow-wrap:anywhere}'
STALE = ['.msg .text{', '.msg.bot .text{', '.tutoring .msg.bot .text{']
RUNNING = {'calendar-app': {'/app/public/companion/panel.css': FIXED},
           'garyhub-lab': {'/lab/public/companion/panel.css': FIXED}}


def verify():
    prior.verify()
    for host in ['tools.garyhub.uk', 'garyhub.uk', 'calendar.garyhub.uk']:
        css = runtime.https(host, '/companion/panel.css?v='+CONFIG['version']).decode()
        if FIXED not in css or any(rule in css for rule in STALE):
            raise RuntimeError('Companion bubble styles still match formula text: '+host)
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
