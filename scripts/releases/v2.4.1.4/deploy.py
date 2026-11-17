"""v2.4.1.4: settings centre with account-wide preferences.

Reuses the v2.4.1.3 adapter (and through it every earlier check, the guest local-tools check and the curl retry).
Like the releases before it, it builds FROM the running image, so the private developer profile is inherited and not
shipped. The one new table, user_preferences, is created with CREATE TABLE IF NOT EXISTS and has no foreign key, so a
rollback to v2.4.1.3 keeps it untouched and its account-deletion check is not blocked by it.
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_0413.py'
if not source.exists():
    source = ROOT.parent/'v2.4.1.3'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_0413_checks', source)
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

RUNNING = {'calendar-app': {'/app/preferences-api.js': "json_patch(user_preferences.prefs,?2)", '/app/extras.js': 'preferences.register(app',
                            '/app/public/hub-prefs.js': 'window.GaryHubTheme', '/app/account-admin.js': "'ledger_budgets','user_preferences'"},
           'garyhub-lab': {'/lab/server.cjs': 'me|preferences|notifications', '/lab/public/hub-prefs.js': 'window.GaryHubTheme',
                           '/lab/public/personalize/settings.js': 'GaryHubPrefs.saveNow',
                           '/lab/academic.cjs': 'reading.readerWidth=input.readerWidth'}}


def verify():
    prior.verify()
    version = CONFIG['version']
    # The account preferences need a session on every host, and writes need a trusted origin.
    for host in ['calendar.garyhub.uk', 'garyhub.uk', 'tools.garyhub.uk']:
        if checks.status(host, '/api/hub/preferences') != b'401':
            raise RuntimeError('Missing authentication gate: '+host+'/api/hub/preferences')
    if checks.status('calendar.garyhub.uk', '/api/hub/preferences', 'PUT') != b'403':
        raise RuntimeError('Missing origin/CSRF gate: /api/hub/preferences')
    # One shared script, the same bytes on each host, loaded early on the pages.
    scripts = {host: runtime.https(host, '/hub-prefs.js?v='+version) for host in ['calendar.garyhub.uk', 'garyhub.uk', 'tools.garyhub.uk']}
    if len(set(scripts.values())) != 1 or b'window.GaryHubTheme' not in scripts['garyhub.uk']:
        raise RuntimeError('Shared preferences script differs between hosts')
    tag = '<script src="/hub-prefs.js?v='+version+'"></script>'
    for host, route in [('garyhub.uk', '/'), ('tools.garyhub.uk', '/'), ('calendar.garyhub.uk', '/login/')]:
        page = runtime.https(host, route).decode()
        if tag not in page or page.index(tag) > page.index('</head>'):
            raise RuntimeError('Preferences script missing from the head of '+host+route)
    if checks.status('tools.garyhub.uk', '/personalize/') != b'302':
        raise RuntimeError('Settings page login gate missing')
    code = ("const fs=require('fs');"
            "for(const [file,text] of Object.entries(JSON.parse(process.argv[1])))"
            "if(!fs.readFileSync(file,'utf8').includes(text))throw Error('Release change missing: '+file)")
    for service, expected in RUNNING.items():
        if runtime.run(['docker', 'exec', service, 'node', '-e', code, json.dumps(expected)], False).returncode:
            raise RuntimeError('Release change missing in running container: '+service)
    tables = ("const s=require('/app/node_modules/sqlite3'),d=new s.Database('/app/data/calendar.sqlite',s.OPEN_READONLY);"
              "d.get(\"SELECT name FROM sqlite_master WHERE type='table' AND name='user_preferences'\",(e,r)=>{d.close();if(e||!r)process.exit(1);})")
    if runtime.run(['docker', 'exec', 'calendar-app', 'node', '-e', tables], False).returncode:
        raise RuntimeError('Preferences table was not created')


runtime.verify_https = verify
if __name__ == '__main__':
    try:
        runtime.main()
    except Exception as error:
        runtime.say('STOPPED: '+str(error))
        sys.exit(1)
