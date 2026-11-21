"""v2.4.3.0: live game rooms on games.garyhub.uk — 词语默契 (Word Sync) and 对战猜数字 (Number Duel, with a computer player).

Reuses the v2.4.2.0 adapter and through it every earlier check. Builds FROM the running image, so the private developer
profile is inherited and not shipped. No new dependency: the WebSocket server side is plain Node (play-socket.js). One new
table, play_rooms (IF NOT EXISTS, no foreign key, in the account-deletion list); a rollback to v2.4.2.0 ignores it.

Caddy is not changed. v2.4.2.0 added the games.garyhub.uk site block, and Caddy's reverse_proxy already passes WebSocket
upgrades to Tools/Lab, which forwards only the room socket to Calendar. Phase 1 checks, read-only, that the Caddyfile still
holds exactly that block; v2.4.2.0's DNS check, Caddy write and Caddy rollback are not repeated.
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_0420.py'
if not source.exists():
    source = ROOT.parent/'v2.4.2.0'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_0420_checks', source)
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

SITE, SOCKET = prior.SITE, '/api/hub/play/socket'
# This release adds /play/ to the games host's login return routes; v2.4.2.0's running-container marker named the
# shorter list, so its check now looks for the new one.
GAMES_ROUTES = "'https://games.garyhub.uk':['/','/dream/','/play/']"
prior.RUNNING['calendar-app']['/app/public/auth-redirect.js'] = GAMES_ROUTES
prior.RUNNING['garyhub-lab']['/lab/public/auth-redirect.js'] = GAMES_ROUTES
RUNNING = {'calendar-app': {'/app/play-rooms.js': "SOCKET_PATH = '/api/hub/play/socket'", '/app/play-socket.js': "socket.on('end', () => this.destroy());",
                            '/app/play-word.js': 'const normalize = text =>', '/app/play-digits.js': 'function botGuess(history, level, rng)',
                            '/app/extras.js': 'play.attach(app, server);', '/app/app.js': 'attachExtras(app, server);',
                            '/app/account-admin.js': "'dream_games','play_rooms'"},
           'garyhub-lab': {'/lab/games-host.cjs': 'games.upgrade = function upgrade(req, socket, head)', '/lab/server.cjs': "server.on('upgrade',games.upgrade);",
                           '/lab/public/games/play/play.js': "'/api/hub/play/socket'"}}


# ---- Caddy: read-only (phase 1) -----------------------------------------------------------------------------------
def prepare(s, configs, lives, backup):
    if prior.SITE_BLOCK not in (backup/'Caddyfile').read_text():
        raise RuntimeError('The Caddyfile no longer holds the games.garyhub.uk site block that v2.4.2.0 added; review it. Nothing was changed')
    runtime.say('    The games.garyhub.uk site block from v2.4.2.0 is in place; Caddy stays unchanged.')


runtime.HOOKS.clear()
runtime.HOOKS.update(prepare=prepare)


# ---- Verification -------------------------------------------------------------------------------------------------
def upgrade_status(host, origin):
    # A WebSocket handshake without a session, through Caddy and Tools/Lab: the answer shows which gate replied.
    p = runtime.run(['curl', '--http1.1', '--silent', '--max-time', '20', '--resolve', host+':443:127.0.0.1', '-o', '/dev/null', '-w', '%{http_code}',
                     '-H', 'Connection: Upgrade', '-H', 'Upgrade: websocket', '-H', 'Sec-WebSocket-Version: 13', '-H', 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
                     '-H', 'Origin: '+origin, 'https://'+host+SOCKET], False)
    return p.stdout.strip()


def play():
    # The socket reaches Calendar only on the games host: a session is required, and only the games origin is accepted.
    if upgrade_status(SITE, 'https://'+SITE) != b'401':
        raise RuntimeError('Room socket login gate missing on '+SITE)
    if upgrade_status(SITE, 'https://evil.example') != b'403':
        raise RuntimeError('Room socket origin gate missing on '+SITE)
    for host in ['tools.garyhub.uk', 'garyhub.uk']:
        if upgrade_status(host, 'https://'+SITE) != b'404':
            raise RuntimeError('Room socket exposed on '+host)
    # Plain HTTP never reaches the socket path; the room list needs a session; creating a room needs origin and token.
    if checks.status(SITE, SOCKET) != b'404':
        raise RuntimeError('Room socket path answers plain HTTP')
    for host in [SITE, 'calendar.garyhub.uk']:
        if checks.status(host, '/api/hub/play') != b'401':
            raise RuntimeError('Missing authentication gate: '+host+'/api/hub/play')
    if checks.status('calendar.garyhub.uk', '/api/hub/play', 'POST') != b'403':
        raise RuntimeError('Missing origin/CSRF gate: /api/hub/play')


def verify():
    prior.verify()
    play()
    code = ("const fs=require('fs');"
            "for(const [file,text] of Object.entries(JSON.parse(process.argv[1])))"
            "if(!fs.readFileSync(file,'utf8').includes(text))throw Error('Release change missing: '+file)")
    for service, expected in RUNNING.items():
        if runtime.run(['docker', 'exec', service, 'node', '-e', code, json.dumps(expected)], False).returncode:
            raise RuntimeError('Release change missing in running container: '+service)
    # The running Calendar created the new table (read-only query).
    schema = ("const s=require('/app/node_modules/sqlite3'),d=new s.Database('/app/data/calendar.sqlite',s.OPEN_READONLY);"
              "d.get(\"SELECT name FROM sqlite_master WHERE type='table' AND name='play_rooms'\",(e,r)=>{d.close();if(e||!r)process.exit(1);})")
    if runtime.run(['docker', 'exec', 'calendar-app', 'node', '-e', schema], False).returncode:
        raise RuntimeError('Game rooms table was not created')


runtime.verify_https = verify
if __name__ == '__main__':
    try:
        runtime.main()
    except Exception as error:
        runtime.say('STOPPED: '+str(error))
        sys.exit(1)
