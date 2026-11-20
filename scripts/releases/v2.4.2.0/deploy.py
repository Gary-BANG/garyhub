"""v2.4.2.0: the games site games.garyhub.uk with "白日梦想家 / Daydreamer".

Reuses the v2.4.1.6 adapter and through it every earlier check. Builds FROM the running image, so the private developer
profile is inherited and not shipped. One new table, dream_games (IF NOT EXISTS, no foreign key, in the account-deletion
list); a rollback to v2.4.1.6 ignores it.

The new host follows the reviewed v2.1.0.0 pattern for sites.garyhub.uk:
- prepare (phase 1, before anything changes): public DNS for games.garyhub.uk must already reach this server, and a
  candidate Caddyfile with one appended site block must pass `caddy validate`; otherwise stop with nothing changed.
- apply (after both new images are healthy): the unchanged Caddyfile is rewritten in place and Caddy reloaded.
- rollback: the original Caddyfile is restored only if it is still the one this release wrote.
"""
import hashlib
import importlib.util
import json
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_0416.py'
if not source.exists():
    source = ROOT.parent/'v2.4.1.6'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_0416_checks', source)
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

SITE = 'games.garyhub.uk'
SITE_BLOCK = SITE+' {\n    encode zstd gzip\n    reverse_proxy garyhub-lab:3000\n}\n'
RUNNING = {'calendar-app': {'/app/games-api.js': "UPDATE dream_games SET status=?,play=?", '/app/extras.js': 'games.register(app, {db, requireLogin, pusher})',
                            '/app/app.js': '"https://games.garyhub.uk"]', '/app/account-admin.js': "'notify_deliveries','dream_games'",
                            '/app/public/auth-redirect.js': "'https://games.garyhub.uk':['/','/dream/']", '/app/public/sw.js': "'games.garyhub.uk'"},
           'garyhub-lab': {'/lab/games-host.cjs': "const HOST = 'games.garyhub.uk'", '/lab/server.cjs': "if(await games(req,res,url,host))return;",
                           '/lab/public/auth-redirect.js': "'https://games.garyhub.uk':['/','/dream/']", '/lab/public/games/dream/dream.js': "crypto.subtle.digest('SHA-256'"}}


# ---- DNS and Caddy (prepare / apply / rollback) -------------------------------------------------------------------
def addresses(name):
    try:
        return {info[4][0] for info in socket.getaddrinfo(name, 443, socket.AF_INET, socket.SOCK_STREAM)}
    except socket.gaierror:
        return set()


def local_addresses():
    p = subprocess.run(['hostname', '-I'], capture_output=True, text=True)
    return set(p.stdout.split()) if p.returncode == 0 else set()


def check_dns():
    # Caddy can only obtain the certificate once public DNS reaches this server.
    site = addresses(SITE)
    known = addresses('garyhub.uk') | addresses('tools.garyhub.uk') | local_addresses()
    if not site:
        raise RuntimeError('DNS for '+SITE+' does not exist yet. In Cloudflare add an A record named "games" with the same IPv4 as garyhub.uk, '
                           'proxy status DNS only, wait a minute and run RUN-UPDATE again. Nothing was changed')
    if not site <= known:
        raise RuntimeError('DNS for '+SITE+' points to '+', '.join(sorted(site))+', not to this GaryHub server. Fix the Cloudflare A record (DNS only) '
                           'and run RUN-UPDATE again. Nothing was changed')


def caddy_with_site(text):
    # Append the site once; an existing definition must be exactly this release's block.
    if re.search(r'(?m)^[^#\n]*\b'+re.escape(SITE)+r'\b', text):
        if SITE_BLOCK in text:
            return text
        raise RuntimeError('Caddy already defines '+SITE+' differently; review the Caddyfile. Nothing was changed')
    return text.rstrip('\n')+'\n\n'+SITE_BLOCK


def validate_caddy(path):
    target = '/tmp/garyhub-v2420-candidate'
    runtime.run(['docker', 'cp', str(path), 'caddy:'+target])
    try:
        runtime.run(['docker', 'exec', 'caddy', 'caddy', 'validate', '--config', target, '--adapter', 'caddyfile'])
    finally:
        runtime.run(['docker', 'exec', 'caddy', 'rm', '-f', target], False)


def prepare(s, configs, lives, backup):
    check_dns()
    candidate = backup/'Caddyfile.games-new'
    candidate.write_text(caddy_with_site((backup/'Caddyfile').read_text()))
    validate_caddy(candidate)
    s['games_caddy'] = {'candidate': str(candidate), 'applied': False}
    runtime.say('    DNS for '+SITE+' reaches this server; the Caddy site block validated.')


def apply(s):
    ext = s['games_caddy']
    if runtime.sha(s['caddy_path']) != runtime.sha(Path(s['backup'])/'Caddyfile'):
        raise RuntimeError('Caddy changed during the update')
    runtime.set_caddy(s['caddy_path'], Path(ext['candidate']).read_text())
    ext.update(applied=True, sha=runtime.sha(s['caddy_path']))
    s['managed_caddy_sha'] = ext['sha']
    runtime.write(runtime.STATE, s)


def rollback(s, manual):
    ext = s.get('games_caddy')
    if not ext or not ext.get('applied'):
        return
    original = Path(s['backup'])/'Caddyfile'
    current = runtime.sha(s['caddy_path'])
    if current != runtime.sha(original):
        if current != ext.get('sha'):
            raise RuntimeError('Caddy changed after this release; rollback needs review')
        runtime.set_caddy(s['caddy_path'], original.read_text())
    ext['applied'] = False
    runtime.write(runtime.STATE, s)


runtime.HOOKS.update(prepare=prepare, apply=apply, rollback=rollback)


# ---- Verification -------------------------------------------------------------------------------------------------
def wait_for_site():
    # The first request after the reload may wait for Let's Encrypt; allow a few minutes. Signed out, the lobby
    # answers with the login redirect.
    for _ in range(36):
        p = runtime.run(['curl', '--silent', '--max-time', '20', '--resolve', SITE+':443:127.0.0.1', '-o', '/dev/null', '-w', '%{http_code}', 'https://'+SITE+'/'], False)
        if p.returncode == 0 and p.stdout.strip() == b'302':
            return
        time.sleep(5)
    raise RuntimeError('HTTPS for '+SITE+' did not come up; check that the Cloudflare record is DNS only (grey cloud)')


def games():
    version = CONFIG['version']
    for asset in CONFIG['games_asset_checksums']:
        if hashlib.sha256(runtime.https(SITE, asset['route']+'?v='+version)).hexdigest() != asset['sha256']:
            raise RuntimeError('Release asset mismatch: '+SITE+asset['route'])
    # The lobby and the game page: the running file's bytes, and a login redirect back to the same page.
    for asset in CONFIG['games_page_checksums']:
        checks.protected_asset(asset)
    if not re.search(r"(?im)^content-security-policy:\s*default-src 'none';", checks.curl_headers(SITE, '/games.js?v='+version)):
        raise RuntimeError('Games host CSP missing')
    # The host answers only its own files and APIs; other hosts never serve /games/.
    for route in ['/lab/', '/tools-catalog.js', '/health', '/api/todos', '/games/games.js', '/companion/boot.js']:
        if checks.status(SITE, route) != b'404':
            raise RuntimeError('Games host exposes another file: '+route)
    for host in ['tools.garyhub.uk', 'garyhub.uk']:
        if checks.status(host, '/games/index.html') != b'404':
            raise RuntimeError('Games files exposed on '+host)
    # The game API needs a session on both hosts, and its writes a trusted origin and the page token.
    for host in [SITE, 'tools.garyhub.uk', 'calendar.garyhub.uk']:
        if checks.status(host, '/api/hub/games') != b'401':
            raise RuntimeError('Missing authentication gate: '+host+'/api/hub/games')
    if checks.status('calendar.garyhub.uk', '/api/hub/games', 'POST') != b'403':
        raise RuntimeError('Missing origin/CSRF gate: /api/hub/games')
    if 'href="https://games.garyhub.uk/"' not in runtime.https('garyhub.uk', '/').decode():
        raise RuntimeError('Homepage games link missing')


def verify():
    wait_for_site()
    prior.verify()
    games()
    code = ("const fs=require('fs');"
            "for(const [file,text] of Object.entries(JSON.parse(process.argv[1])))"
            "if(!fs.readFileSync(file,'utf8').includes(text))throw Error('Release change missing: '+file)")
    for service, expected in RUNNING.items():
        if runtime.run(['docker', 'exec', service, 'node', '-e', code, json.dumps(expected)], False).returncode:
            raise RuntimeError('Release change missing in running container: '+service)
    # The running Calendar created the new table (read-only query).
    schema = ("const s=require('/app/node_modules/sqlite3'),d=new s.Database('/app/data/calendar.sqlite',s.OPEN_READONLY);"
              "d.get(\"SELECT name FROM sqlite_master WHERE type='table' AND name='dream_games'\",(e,r)=>{d.close();if(e||!r)process.exit(1);})")
    if runtime.run(['docker', 'exec', 'calendar-app', 'node', '-e', schema], False).returncode:
        raise RuntimeError('Games table was not created')


runtime.verify_https = verify
if __name__ == '__main__':
    try:
        runtime.main()
    except Exception as error:
        runtime.say('STOPPED: '+str(error))
        sys.exit(1)
