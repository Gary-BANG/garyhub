"""v2.4.1.3: shared header and icons, homepage today panel, site search, guest local tools, developer public card,
calendar subscription, browser push, ledger budgets and CSV, A-share price alerts.

Reuses the v2.4.1.2 adapter (and through it every earlier check and the curl retry). Like v2.4.1.1 and v2.4.1.2 it
builds FROM the running image, so the private developer profile is inherited and not shipped.

One retained check changes on purpose: the shared runtime's HTTPS check requires the three in-browser tools
(image eraser, Markdown viewer, PDF gray) to redirect guests to the login page. This release opens them to guests,
so that one step is replaced by the opposite check (guests get the page with its CSP); everything else the shared
check does is kept. New tables are added with CREATE TABLE IF NOT EXISTS and no foreign keys, so a rollback to
v2.4.1.2 keeps them untouched and its account-deletion check is not blocked by them.
"""
import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_0412.py'
if not source.exists():
    source = ROOT.parent/'v2.4.1.2'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_0412_checks', source)
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
checks, runtime = prior.checks, prior.runtime
# The earlier modules configured themselves from the file next to them; point everything at this release.
prior.CONFIG = prior.prior.CONFIG = prior.prior.prior.CONFIG = prior.prior.prior.prior.CONFIG = checks.CONFIG = CONFIG
runtime.configure(ROOT, CONFIG)

GUEST_TOOLS = ['image-eraser', 'markdown-viewer', 'pdf-gray']
TABLES = ['calendar_feeds', 'push_keys', 'push_subscriptions', 'push_reminder_log', 'stock_alerts', 'ledger_budgets']
RUNNING = {'calendar-app': {'/app/extras.js': 'registerExtras', '/app/push-api.js': "'Content-Encoding': 'aes128gcm'",
                            '/app/calendar-feed.js': 'text/calendar', '/app/stock-alerts.js': 'stock-alert:',
                            '/app/ledger-budget.js': 'ledger_budgets', '/app/account-admin.js': "'calendar_feeds','push_subscriptions'"},
           'garyhub-lab': {'/lab/hub-extras.cjs': '/api/hub/today', '/lab/server.cjs': 'hubExtras(req,res,url)',
                           '/lab/public/home/today.js': '/api/hub/today'}}


def shared_without_useful_login_gate():
    """The shared runtime's HTTPS check, except that the three local tools are now open to guests."""
    html = runtime.https('tools.garyhub.uk', '/').decode()
    if '/useful/tool-i18n.js' not in html:
        raise RuntimeError('Tools language catalog is missing')
    for tool in GUEST_TOOLS:
        route = '/useful/'+tool+'/'
        if 'href="'+route+'"' not in html:
            raise RuntimeError('Useful tool catalog missing: '+tool)
        headers = checks.curl_headers('tools.garyhub.uk', route)
        status = re.findall(r'(?im)^HTTP/[\d.]+\s+(\d{3})', headers)
        if not status or status[-1] != '200' or not re.search(r"(?im)^content-security-policy:.*connect-src 'self'", headers):
            raise RuntimeError('Useful tool is not open to guests with its CSP: '+tool)
    for route in ['/useful/tool-i18n.js', '/useful/tool-shell.js', '/useful/tool-shell.css', '/useful/markdown-viewer/app.js',
                  '/useful/markdown-viewer/zip-reader.mjs', '/useful/pdf-gray/app.js', '/i18n/i18n.js']:
        if not runtime.https('tools.garyhub.uk', route):
            raise RuntimeError('Useful tool asset missing: '+route)
    for host in ['tools.garyhub.uk', 'calendar.garyhub.uk']:
        if json.loads(runtime.https(host, '/privacy-ledger-release.json'))['version'] != CONFIG['version']:
            raise RuntimeError('HTTPS version mismatch')
    for route in ['/api/todos', '/api/ledger/categories']:
        if checks.status('calendar.garyhub.uk', route) != b'401':
            raise RuntimeError('Private record authentication check failed')
    for route in ['/homepage-protected.json', '/profile-private.json']:
        if checks.status('garyhub.uk', route) != b'404':
            raise RuntimeError('Unexpected public profile route')


checks.shared = shared_without_useful_login_gate


def verify():
    prior.verify()
    version = CONFIG['version']
    home = runtime.https('garyhub.uk', '/').decode()
    for marker in ['data-gh-header', 'id="today"', '/home/today.js?v='+version, '/hub-search.js?v='+version, 'rel="manifest"', 'class="brand gh-brand"']:
        if marker not in home:
            raise RuntimeError('Homepage marker missing: '+marker)
    if 'class="brand gh-brand"' not in runtime.https('tools.garyhub.uk', '/').decode():
        raise RuntimeError('Tools page still has the old header')
    if 'id="loginReason"' not in runtime.https('calendar.garyhub.uk', '/login/').decode():
        raise RuntimeError('Login page destination hint missing')
    # Every new API needs a session (or, for writes, a trusted origin) on each host that exposes it.
    gates = [('calendar.garyhub.uk', '/api/hub/today'), ('calendar.garyhub.uk', '/api/hub/search?q=x'), ('garyhub.uk', '/api/hub/today'),
             ('garyhub.uk', '/api/hub/search?q=x'), ('tools.garyhub.uk', '/api/hub/today'), ('calendar.garyhub.uk', '/api/calendar-feed'),
             ('calendar.garyhub.uk', '/api/push/status'), ('calendar.garyhub.uk', '/api/ledger/budgets?month=2026-11&currency=USD'),
             ('calendar.garyhub.uk', '/api/stocks/alerts'), ('calendar.garyhub.uk', '/stocks/alerts.js')]
    for host, route in gates:
        if checks.status(host, route) != b'401':
            raise RuntimeError('Missing authentication gate: '+host+route)
    for route in ['/api/calendar-feed', '/api/push/subscribe', '/api/stocks/alerts']:
        if checks.status('calendar.garyhub.uk', route, 'POST') != b'403':
            raise RuntimeError('Missing origin/CSRF gate: '+route)
    if checks.status('calendar.garyhub.uk', '/feed/'+'A'*32+'.ics') != b'404':
        raise RuntimeError('Unknown calendar subscription address is not refused')
    for host in ['garyhub.uk', 'tools.garyhub.uk', 'calendar.garyhub.uk']:
        if not re.search(r'(?im)^content-type:\s*application/manifest\+json', checks.curl_headers(host, '/manifest.webmanifest')):
            raise RuntimeError('Web app manifest missing: '+host)
    code = ("const fs=require('fs');"
            "for(const [file,text] of Object.entries(JSON.parse(process.argv[1])))"
            "if(!fs.readFileSync(file,'utf8').includes(text))throw Error('Release change missing: '+file)")
    for service, expected in RUNNING.items():
        if runtime.run(['docker', 'exec', service, 'node', '-e', code, json.dumps(expected)], False).returncode:
            raise RuntimeError('Release change missing in running container: '+service)
    # The new tables were created by the running Calendar (read-only query).
    tables = ("const s=require('/app/node_modules/sqlite3'),d=new s.Database('/app/data/calendar.sqlite',s.OPEN_READONLY);"
              "d.all(\"SELECT name FROM sqlite_master WHERE type='table'\",(e,r)=>{if(e)throw e;const have=new Set(r.map(x=>x.name));"
              "const missing=JSON.parse(process.argv[1]).filter(t=>!have.has(t));d.close();if(missing.length){console.error(missing.join(','));process.exit(1);}})")
    if runtime.run(['docker', 'exec', 'calendar-app', 'node', '-e', tables, json.dumps(TABLES)], False).returncode:
        raise RuntimeError('New Calendar tables were not created')


runtime.verify_https = verify
if __name__ == '__main__':
    try:
        runtime.main()
    except Exception as error:
        runtime.say('STOPPED: '+str(error))
        sys.exit(1)
