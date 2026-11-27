"""Checks for v2.4.4.0's installer contract, inherited safeguards and public assets."""
import hashlib
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parents[2]
PREVIOUS = ROOT / 'scripts/releases/v2.4.3.4'
CONFIG = json.loads((HERE / 'release-config.json').read_text())
PAGE = '/useful/site-navigator/'


def app_file(path):
    service, relative = path.lstrip('/').split('/', 1)
    return ROOT / {'app': 'calendar-app', 'lab': 'lab-service'}[service] / relative


def public_file(asset):
    host, route = asset['host'], asset['route']
    base = ROOT / ('calendar-app' if host == 'calendar.garyhub.uk' else 'lab-service') / 'public'
    if host in ('sites.garyhub.uk', 'games.garyhub.uk'):
        base /= host.split('.')[0]
    if route == '/' and host == 'garyhub.uk':
        return base / 'homepage.html'
    elif route in ('/admin/', '/admin/index.html'):
        return base / 'admin.html'
    return base / (route.lstrip('/') + ('index.html' if route.endswith('/') else ''))


def load_deploy():
    spec = importlib.util.spec_from_file_location('navigator_adapter_test', HERE / 'deploy.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class NavigatorRelease(unittest.TestCase):
    def test_registered_base_and_capabilities(self):
        manifest = json.loads((ROOT / 'releases/2.4.4.0.json').read_text())
        previous = json.loads((ROOT / 'releases/2.4.3.4.json').read_text())
        self.assertEqual(CONFIG['version'], manifest['version'])
        self.assertEqual(CONFIG['installer_build'], 'v2.4.4.0-r1')
        self.assertEqual(CONFIG['requires_release'], '2.4.3.4')
        self.assertEqual(CONFIG['reviewed_base_commit'], manifest['reviewed_base_commit'])
        self.assertEqual(CONFIG['baseline_adapter'], 'scripts/releases/v2.4.3.4')
        self.assertEqual(manifest['capability_variants'], previous['capability_variants'])
        self.assertTrue(set(previous['protections']) <= set(manifest['protections']))
        base_json = subprocess.check_output(['git', '-C', str(ROOT), 'show', CONFIG['reviewed_base_commit'] + ':releases/current.json'])
        self.assertEqual(json.loads(base_json)['source_version'], '2.4.3.4')

    def test_registered_checks_and_release_notice(self):
        old = json.loads((PREVIOUS / 'release-config.json').read_text())
        self.assertEqual(CONFIG['isolation_checks'], [*old['isolation_checks'], 'navigator-http.cjs'])
        self.assertIn('PROJECT_CONTEXT.md', CONFIG['outer_files'])
        for path in [*CONFIG['test_inputs'].values(), *CONFIG['support_files'].values(), *CONFIG['outer_files'].values()]:
            self.assertTrue((ROOT / path).is_file(), path)
        note = json.loads((ROOT / 'calendar-app/releases/garyhub-2.4.4.0.json').read_text())
        self.assertEqual([n['scope'] for n in note['notes']], ['tools'])
        self.assertIn('通知中心', note['notes'][0]['body'])

    def test_assets_match_served_bytes(self):
        for group in ('asset_checksums', 'protected_asset_checksums', 'admin_asset_checksums',
                      'sites_asset_checksums', 'games_asset_checksums', 'games_page_checksums'):
            for a in CONFIG[group]:
                with self.subTest(host=a['host'], route=a['route']):
                    self.assertEqual(hashlib.sha256(public_file(a).read_bytes()).hexdigest(), a['sha256'])
        paths = {a['route'] for a in CONFIG['asset_checksums'] if a['route'].startswith(PAGE)}
        self.assertEqual(paths, {PAGE + ('' if f.name == 'index.html' else f.name)
                                 for f in (ROOT / 'lab-service/public/useful/site-navigator').iterdir()})
        for name in ('auth-redirect.js', 'hub-search.js', 'tools-catalog.js'):
            self.assertEqual((ROOT / 'lab-service/public' / name).read_bytes(),
                             (ROOT / 'calendar-app/public' / name).read_bytes())

    def test_capability_entry_points(self):
        for root in (ROOT, HERE / 'variant-overrides/1.3.4.1'):
            app = (root / 'calendar-app/app.js').read_text()
            self.assertIn('require("./site-navigator")', app)
            self.assertIn('site-navigator', (root / 'lab-service/server.cjs').read_text())
            self.assertEqual('require("./totp-api")' in app, root == ROOT)

    @unittest.skipUnless(importlib.util.find_spec('fcntl'), 'Linux server runtime')
    def test_running_markers_and_read_only_caddy(self):
        deploy = load_deploy()
        self.assertIs(deploy.runtime.verify_https, deploy.verify)
        self.assertEqual(deploy.runtime.VERSION, CONFIG['version'])
        self.assertEqual(deploy.runtime.REQUIRES, CONFIG['requires_release'])
        self.assertEqual(sorted(deploy.runtime.HOOKS), ['prepare'])
        module = deploy
        while module is not None:
            self.assertEqual(module.CONFIG['version'], CONFIG['version'])
            for items in getattr(module, 'RUNNING', {}).values():
                for path, marker in items.items():
                    self.assertIn(marker, app_file(path).read_text(), path)
            module = getattr(module, 'prior', None)
        hook = deploy.runtime.HOOKS['prepare']
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp) / 'Caddyfile'
            data = 'garyhub.uk {\n  reverse_proxy garyhub-lab:3000\n}\n'
            p.write_text(data)
            with self.assertRaises(RuntimeError):
                hook({}, {}, {}, p.parent)
            self.assertEqual(p.read_text(), data)

    @unittest.skipUnless(importlib.util.find_spec('fcntl'), 'Linux server runtime')
    def test_deploy_checks_real_entry_and_refuses_missing_page(self):
        deploy = load_deploy()
        page = public_file({'host': 'tools.garyhub.uk', 'route': PAGE}).read_bytes()
        with patch.object(deploy.prior, 'verify') as previous, patch.object(deploy.runtime, 'run') as run:
            with patch.object(deploy.runtime, 'https', return_value=page):
                deploy.verify()
            previous.assert_called_once()
            self.assertIn('site_permission_incidents', run.call_args.args[0][-1])
            with patch.object(deploy.runtime, 'https', return_value=b'not found'), self.assertRaises(RuntimeError):
                deploy.verify()


if __name__ == '__main__':
    unittest.main()
