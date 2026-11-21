"""v2.4.3.3: 大富翁 (Tycoon) gets trading with counter-offers, auctions, three ways to win, an asset chart and the
computer's reasons; both board games get an animation speed each player picks.

Reuses the v2.4.3.2 adapter and through it every earlier check (read-only Caddy check, the room-socket gates through
Caddy, the car file compared between the two containers, the board-game files). Builds FROM the running image. No new
table and no new dependency: the new rules live in the Tycoon game state inside play_rooms; rooms and saved games from
v2.4.3.2 keep their old rules.
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_0432.py'
if not source.exists():
    source = ROOT.parent/'v2.4.3.2'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_0432_checks', source)
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
runtime.HOOKS.update(prepare=prior.prior.prior.prepare)

RUNNING = {'calendar-app': {'/app/play-monopoly.js': 'function startAuction(', '/app/play-rooms.js': 'resume?.(room.state, {pausedFor})',
                            '/app/releases/garyhub-2.4.3.3.json': '拍卖'},
           'garyhub-lab': {'/lab/public/games/play/monopoly.js': 'function tradeCard()', '/lab/public/games/play/board.js': 'function speedControl()',
                           '/lab/public/games/play/play.js': 'field.show && !field.show(view.settings)'}}


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
