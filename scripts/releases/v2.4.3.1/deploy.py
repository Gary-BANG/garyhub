"""v2.4.3.1: 合作小车 (Co-op Car) in the live game rooms on games.garyhub.uk.

Reuses the v2.4.3.0 adapter and through it every earlier check, including the read-only check that the Caddyfile still
holds the games.garyhub.uk site block and the room-socket gates through Caddy. Builds FROM the running image. No new
table and no new dependency: rooms keep using play_rooms, and the car runs inside the existing Calendar process.

The car's tracks and physics are one file used by both services: Calendar runs play-car-sim.js, and the page loads a
byte-identical copy (public/games/play/car-sim.js) to draw the same tracks; verification compares the two in the
running containers.
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_0430.py'
if not source.exists():
    source = ROOT.parent/'v2.4.3.0'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_0430_checks', source)
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
runtime.HOOKS.update(prepare=prior.prepare)

SIM = {'calendar-app': '/app/play-car-sim.js', 'garyhub-lab': '/lab/public/games/play/car-sim.js'}
RUNNING = {'calendar-app': {'/app/play-car.js': 'realtime: {hz: 20, send: 20}', '/app/play-car-sim.js': 'root.CarSim = factory();',
                            '/app/play-rooms.js': 'function realtime(conn, message, now)', '/app/releases/garyhub-2.4.3.1.json': '合作小车'},
           'garyhub-lab': {'/lab/public/games/play/car.js': "window.Play.register('car'", '/lab/public/games/play/car-sim.js': 'root.CarSim = factory();',
                           '/lab/games-host.cjs': 'car\\.js|car-sim\\.js'}}


def verify():
    prior.verify()
    code = ("const fs=require('fs');"
            "for(const [file,text] of Object.entries(JSON.parse(process.argv[1])))"
            "if(!fs.readFileSync(file,'utf8').includes(text))throw Error('Release change missing: '+file)")
    for service, expected in RUNNING.items():
        if runtime.run(['docker', 'exec', service, 'node', '-e', code, json.dumps(expected)], False).returncode:
            raise RuntimeError('Release change missing in running container: '+service)
    # The server and the page use the same car file.
    digest = "process.stdout.write(require('crypto').createHash('sha256').update(require('fs').readFileSync(process.argv[1])).digest('hex'))"
    sums = set()
    for service, path in SIM.items():
        p = runtime.run(['docker', 'exec', service, 'node', '-e', digest, path], False)
        if p.returncode or len(p.stdout.strip()) != 64:
            raise RuntimeError('Car simulation file missing in '+service)
        sums.add(p.stdout.strip())
    if len(sums) != 1:
        raise RuntimeError('Car simulation differs between Calendar and the page')


runtime.verify_https = verify
if __name__ == '__main__':
    try:
        runtime.main()
    except Exception as error:
        runtime.say('STOPPED: '+str(error))
        sys.exit(1)
