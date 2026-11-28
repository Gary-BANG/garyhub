"""Reuse the previous release verifier and confirm the served one-click navigation controls."""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CONFIG = json.loads((ROOT / 'release-config.json').read_text(encoding='utf-8'))
source = ROOT / 'prior_0441.py'
if not source.exists():
    source = ROOT.parent / 'v2.4.4.1' / 'deploy.py'
spec = importlib.util.spec_from_file_location('navigator_previous', source)
prior = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prior)
runtime = prior.runtime
module = prior
while module is not None:
    module.CONFIG = CONFIG
    module = getattr(module, 'prior', None)
prior.checks.CONFIG = CONFIG
prepare_caddy = runtime.HOOKS['prepare']
runtime.configure(ROOT, CONFIG)
runtime.HOOKS.update(prepare=prepare_caddy)


def verify():
    prior.verify()
    html = runtime.https('tools.garyhub.uk', '/useful/site-navigator/?v=' + CONFIG['version'])
    if not all(marker in html for marker in (b'id="keep-copy"', b'id="reader-content"', b'id="copy-badge"')):
        raise RuntimeError('Local copy or reader controls missing from the served page')


runtime.verify_https = verify
if __name__ == '__main__':
    try:
        runtime.main()
    except Exception as error:
        runtime.say('STOPPED: ' + str(error))
        sys.exit(1)
