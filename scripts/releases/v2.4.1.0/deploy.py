"""v2.4.1.0: starfield homepage and developer profile.

Reuses the v2.4.0.4 adapter (its retained host checks and the curl retry wrapper) and adds:
- prepare: the reviewed private developer-profile.json shipped in this package (never in Git) is
  validated and placed into the Tools/Lab overlay, so it lands at /lab/developer-profile.json
  outside public/. Rollback restores the prior image, which does not contain it.
- verify: the homepage carries no personal text and links the developer page, the page exists only
  on the homepage host, private files stay 404, and the API returns only access/profile.
"""
import importlib.util
import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT/'release-config.json').read_text(encoding='utf-8'))
source = ROOT/'prior_0404.py'
if not source.exists():
    source = ROOT.parent/'v2.4.0.4'/'deploy.py'
spec = importlib.util.spec_from_file_location('garyhub_0404_checks', source)
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
checks, runtime = prior.checks, prior.runtime
# The v2.4.0.4 module configured itself from the file next to it; point everything at this release.
prior.CONFIG = checks.CONFIG = CONFIG
runtime.configure(ROOT, CONFIG)

PRIVATE = 'developer-profile.json'
SECTIONS = ['identity', 'education', 'projects', 'skills']
ACCESS_KEYS = ['audience', 'complete', 'expiresAt', 'hasCode', 'preview', 'required', 'unlocked']
# Text that only the earlier profile homepage or private sections contain; none of it may be public.
PERSONAL = re.compile(r'ZJUI|Zhejiang|Urbana|2028|Multi-UAV|Intelligent Assistants|data-profile-fragment|该部分已隐藏', re.I)
RUNNING = {'garyhub-lab': {'/lab/homepage-privacy.cjs': "url.pathname==='/api/hub/developer-profile'",
                           '/lab/public/home/cosmos.js': "canvas[data-cosmos]",
                           '/lab/public/developer/developer.js': "/api/hub/developer-profile"}}


def private_profile():
    path = ROOT/PRIVATE
    if not path.is_file():
        raise RuntimeError('Private developer profile missing from the package; no service was changed')
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('schema') != 1 or any(not isinstance(data.get(k), dict) for k in SECTIONS):
        raise RuntimeError('Private developer profile has an unexpected structure; no service was changed')
    return path


def prepare(s, configs, lives, backup):
    path = private_profile()
    for variant in ['1.3.4.1', '1.3.4.2']:
        target = ROOT/'payload'/variant/'lab-service'/PRIVATE
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
    runtime.say('    Private developer profile staged for the Tools/Lab image (not public).')


def verify():
    prior.verify()
    home = runtime.https('garyhub.uk', '/').decode()
    for marker in ['data-cosmos="full"', '<a href="/developer/"><strong>Developer Profile</strong>']:
        if marker not in home:
            raise RuntimeError('Homepage marker missing: '+marker)
    if PERSONAL.search(home):
        raise RuntimeError('Homepage carries personal text')
    page = runtime.https('garyhub.uk', '/developer/').decode()
    if 'id="devView"' not in page or PERSONAL.search(page):
        raise RuntimeError('Developer page differs from the release')
    if checks.status('garyhub.uk', '/developer') != b'302':
        raise RuntimeError('Developer page redirect missing')
    if checks.status('tools.garyhub.uk', '/developer/') != b'404':
        raise RuntimeError('Developer page served outside the homepage host')
    for route in ['/'+PRIVATE, '/homepage-protected.json', '/profile-private.json']:
        for host in ['garyhub.uk', 'tools.garyhub.uk']:
            if checks.status(host, route) != b'404':
                raise RuntimeError('Private profile file is reachable: '+host+route)
    api = json.loads(runtime.https('garyhub.uk', '/api/hub/developer-profile'))
    if sorted(api) != ['access', 'profile'] or sorted(api['access']) != ACCESS_KEYS:
        raise RuntimeError('Developer profile API response differs from the release')
    if set(api['profile']) - set(SECTIONS+['academics']):
        raise RuntimeError('Developer profile API returned an unknown section')
    code = ("const fs=require('fs');"
            "for(const [file,text] of Object.entries(JSON.parse(process.argv[1])))"
            "if(!fs.readFileSync(file,'utf8').includes(text))throw Error('Release change missing: '+file);"
            "const p=JSON.parse(fs.readFileSync('/lab/"+PRIVATE+"','utf8'));"
            "if(p.schema!==1||"+json.dumps(SECTIONS)+".some(k=>!p[k]||typeof p[k]!=='object'))throw Error('profile')")
    for service, expected in RUNNING.items():
        if runtime.run(['docker', 'exec', service, 'node', '-e', code, json.dumps(expected)], False).returncode:
            raise RuntimeError('Release change or private developer profile missing in running container: '+service)


runtime.HOOKS['prepare'] = prepare
runtime.verify_https = verify
if __name__ == '__main__':
    try:
        if '--rollback' not in sys.argv:
            private_profile()
        runtime.main()
    except Exception as error:
        runtime.say('STOPPED: '+str(error))
        sys.exit(1)
