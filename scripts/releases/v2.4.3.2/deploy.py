"""v2.4.3.2: 骰子抢宝箱 (Treasure Dash) and 大富翁 (Tycoon) in the live game rooms on games.garyhub.uk.

Reuses the v2.4.3.1 adapter and through it every earlier check (read-only Caddy check, the room-socket gates through
Caddy, the car file compared between the two containers). Builds FROM the running image. No new table and no new
dependency: board-game rooms live in play_rooms like the others; seat counts and 托管 are part of the room's record.
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_0431.py'
if not source.exists():
    source = ROOT.parent/'v2.4.3.1'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_0431_checks', source)
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
# Caddy is still only read (v2.4.3.0's phase-1 check); nothing is written or restored.
runtime.HOOKS.update(prepare=prior.prior.prepare)

RUNNING = {'calendar-app': {'/app/play-treasure.js': "id: 'treasure'", '/app/play-monopoly.js': "id: 'monopoly'",
                            '/app/play-rooms.js': "takeover(room, seat, d)", '/app/releases/garyhub-2.4.3.2.json': '大富翁'},
           'garyhub-lab': {'/lab/public/games/play/board.js': 'window.Board =', '/lab/public/games/play/treasure.js': "window.Play.register('treasure'",
                           '/lab/public/games/play/monopoly.js': "window.Play.register('monopoly'", '/lab/games-host.cjs': 'board\\.js|treasure\\.js|monopoly\\.js'}}


def verify():
    prior.verify()
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
