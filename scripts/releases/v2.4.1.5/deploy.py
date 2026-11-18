"""v2.4.1.5: the rest of the appearance, region and Study Hub settings (accent colour, density, week start, date format,
calendar default view, code font, formula size).

Reuses the v2.4.1.4 adapter and through it every earlier check. Builds FROM the running image, so the private developer
profile is inherited and not shipped. No new table: the five new preferences are keys in user_preferences, and the two
Study Hub settings live in the existing Study Hub record, so a rollback to v2.4.1.4 simply ignores them.
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_0414.py'
if not source.exists():
    source = ROOT.parent/'v2.4.1.4'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_0414_checks', source)
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
checks, runtime = prior.checks, prior.runtime
# The earlier modules configured themselves from the file next to them; point everything at this release.
module = prior
while module is not None:
    module.CONFIG = CONFIG
    module = getattr(module, 'prior', None)
checks.CONFIG = CONFIG
runtime.configure(ROOT, CONFIG)

RUNNING = {'calendar-app': {'/app/preferences-api.js': "'calendar.view': ['month', 'week', 'list']",
                            '/app/public/calendar-page.js': "value('region.weekStart')==='sunday'?0:1",
                            '/app/public/hub-prefs.js': 'function formatDate(iso)', '/app/public/brand.css': 'html[data-gh-density=compact]'},
           'garyhub-lab': {'/lab/academic.cjs': "reading.codeFont=input.codeFont", '/lab/public/academic/core.js': "s.settings.mathScale",
                           '/lab/public/hub-prefs.js': 'function formatDate(iso)', '/lab/public/personalize/settings.js': "'appearance.accent'"}}


def verify():
    prior.verify()
    version = CONFIG['version']
    # The shared stylesheet carries the accent and density rules, the same bytes on every host.
    sheets = {host: runtime.https(host, '/brand.css?v='+version) for host in ['calendar.garyhub.uk', 'garyhub.uk', 'tools.garyhub.uk']}
    if len(set(sheets.values())) != 1 or b'html[data-gh-accent=teal]' not in sheets['garyhub.uk'] or b'html[data-gh-density=compact]' not in sheets['garyhub.uk']:
        raise RuntimeError('Shared stylesheet lacks the accent or density rules')
    # The Study Hub keeps its own reading palettes (it opts out of the account accent); its page is public HTML.
    if b'data-gh-accent-off' not in runtime.https('tools.garyhub.uk', '/study/'):
        raise RuntimeError('Study Hub does not opt out of the account accent')
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
