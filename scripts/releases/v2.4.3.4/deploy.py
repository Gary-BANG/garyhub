"""v2.4.3.4: 大富翁 (Tycoon) — the computer players' new judgement (a reserve that grows with the rent ahead, land valued
by the rounds left, sales when short of cash, buying a group up from two players, bids up to near the price, hotels at
every level) and a bankruptcy settled with the bank (the creditor is paid up to the debt; the land goes back to the bank).

Reuses the v2.4.3.3 adapter and through it every earlier check (read-only Caddy check, the room-socket gates through
Caddy, the car file compared between the two containers, the board-game files, the Tycoon rules of v2.4.3.3). Builds FROM
the running image. No new table and no new dependency: the change lives in the Tycoon game state inside play_rooms;
rooms made before keep handing a bankrupt player's land to the creditor.
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_0433.py'
if not source.exists():
    source = ROOT.parent/'v2.4.3.3'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_0433_checks', source)
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
runtime.HOOKS.update(prepare=prior.prior.prior.prior.prepare)

RUNNING = {'calendar-app': {'/app/play-monopoly.js': 'function gather(', '/app/releases/garyhub-2.4.3.4.json': '破产'},
           'garyhub-lab': {'/lab/public/games/play/monopoly.js': "case 'sale':"}}


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
