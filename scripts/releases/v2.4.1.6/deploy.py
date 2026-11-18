"""v2.4.1.6: homepage cards and entry order, tools desk pins / hidden / recent tools, and the notification centre
(channels per kind of notice, push quiet hours, default reminder of new tasks, push devices, calendar subscription).

Reuses the v2.4.1.5 adapter and through it every earlier check. Builds FROM the running image, so the private developer
profile is inherited and not shipped. One new table, notify_deliveries (IF NOT EXISTS, no foreign key, in the
account-deletion list), and one nullable column, push_subscriptions.label; a rollback to v2.4.1.5 ignores both.
The reminder worker is not switched (as before): e-mail reminders an account turned off are held through the
reminder_deliveries rows the worker already respects, so no worker change is needed.
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_0415.py'
if not source.exists():
    source = ROOT.parent/'v2.4.1.5'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_0415_checks', source)
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

RUNNING = {'calendar-app': {'/app/notify-api.js': "INSERT OR IGNORE INTO reminder_deliveries", '/app/notify-channels.js': 'out.updates.inApp = true',
                            '/app/extras.js': 'notify.start(db, pusher)', '/app/preferences-api.js': "'tools.pinned': list(TOOLS, 8)",
                            '/app/push-api.js': 'function deviceLabel(agent)', '/app/account-admin.js': "'user_preferences','notify_deliveries'",
                            '/app/public/unified.js': 'function applyReminderDefault()'},
           'garyhub-lab': {'/lab/server.cjs': 'notify(?:\\/devices\\/\\d+\\/remove|\\/feed)?', '/lab/public/home/today.js': "pref('home.cards')",
                           '/lab/public/tools-dock.js': "prefList('tools.recent')", '/lab/public/personalize/settings.js': "'notify/devices/'"}}


def verify():
    prior.verify()
    version = CONFIG['version']
    # The notification centre needs a session on every host, and its writes need a trusted origin and the page token.
    for host in ['calendar.garyhub.uk', 'garyhub.uk', 'tools.garyhub.uk']:
        if checks.status(host, '/api/hub/notify') != b'401':
            raise RuntimeError('Missing authentication gate: '+host+'/api/hub/notify')
    for route in ['/api/hub/notify/feed', '/api/hub/notify/devices/1/remove']:
        if checks.status('calendar.garyhub.uk', route, 'POST') != b'403':
            raise RuntimeError('Missing origin/CSRF gate: '+route)
    # The pages that apply the new settings are the ones served.
    for host, route, marker in [('garyhub.uk', '/home/today.js?v='+version, b"'home.cards'"), ('tools.garyhub.uk', '/tools-dock.js?v='+version, b"'tools.recent'"),
                                ('tools.garyhub.uk', '/personalize/settings.js?v='+version, b'notify/devices/')]:
        if marker not in runtime.https(host, route):
            raise RuntimeError('Release page script missing its change: '+host+route)
    code = ("const fs=require('fs');"
            "for(const [file,text] of Object.entries(JSON.parse(process.argv[1])))"
            "if(!fs.readFileSync(file,'utf8').includes(text))throw Error('Release change missing: '+file)")
    for service, expected in RUNNING.items():
        if runtime.run(['docker', 'exec', service, 'node', '-e', code, json.dumps(expected)], False).returncode:
            raise RuntimeError('Release change missing in running container: '+service)
    # The running Calendar created the new table and column (read-only queries).
    schema = ("const s=require('/app/node_modules/sqlite3'),d=new s.Database('/app/data/calendar.sqlite',s.OPEN_READONLY);"
              "d.get(\"SELECT name FROM sqlite_master WHERE type='table' AND name='notify_deliveries'\",(e,r)=>{if(e||!r){d.close();process.exit(1);}"
              "d.all('PRAGMA table_info(push_subscriptions)',(e2,c)=>{d.close();if(e2||!c.some(x=>x.name==='label'))process.exit(1);});})")
    if runtime.run(['docker', 'exec', 'calendar-app', 'node', '-e', schema], False).returncode:
        raise RuntimeError('Notification table or device label column was not created')


runtime.verify_https = verify
if __name__ == '__main__':
    try:
        runtime.main()
    except Exception as error:
        runtime.say('STOPPED: '+str(error))
        sys.exit(1)
