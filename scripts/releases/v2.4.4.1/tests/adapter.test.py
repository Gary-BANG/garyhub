"""Verify the patch upgrade against its exact predecessor and the shipped picker UI."""
import hashlib
import importlib.util
import json
import subprocess
import unittest
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parents[2]
PRIOR = ROOT / 'scripts/releases/v2.4.4.0'
CONFIG = json.loads((HERE / 'release-config.json').read_text())
NAV = ROOT / 'lab-service/public/useful/site-navigator'
BASE = '1aa5eca38991db74cc8c648b8e44386eb785858f'


class PickerMarkup(HTMLParser):
    def __init__(self):
        super().__init__()
        self.in_drawer = False
        self.controls = {}

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        if tag == 'dialog':
            self.in_drawer = attrs.get('id') == 'drawer'
        if self.in_drawer and attrs.get('id'):
            self.controls[attrs['id']] = attrs

    def handle_endtag(self, tag):
        if tag == 'dialog':
            self.in_drawer = False


class ReleaseChecks(unittest.TestCase):
    def test_strict_baseline_and_existing_protections(self):
        current = json.loads((ROOT / 'releases/2.4.4.1.json').read_text())
        self.assertEqual(current['reviewed_base_commit'], BASE)
        self.assertEqual(current['requires_release'], '2.4.4.0')
        old = json.loads(subprocess.check_output(['git', '-C', str(ROOT), 'show', BASE + ':releases/2.4.4.0.json']))
        self.assertEqual(current['capability_variants'], old['capability_variants'])
        self.assertTrue(set(old['protections']) <= set(current['protections']))
        previous = json.loads((PRIOR / 'release-config.json').read_text())
        self.assertEqual(CONFIG['isolation_checks'], previous['isolation_checks'])
        self.assertEqual(CONFIG['baseline_adapter'], 'scripts/releases/v2.4.4.0')
        for name in CONFIG['isolation_checks']:
            self.assertTrue((ROOT / CONFIG['test_inputs'][name]).is_file())
        notice = json.loads((ROOT / 'calendar-app/releases/garyhub-2.4.4.1.json').read_text())
        self.assertEqual([n['scope'] for n in notice['notes']], ['tools'])

    def test_only_version_moves_in_two_capability_entrypoints(self):
        for path in ('calendar-app/app.js', 'lab-service/server.cjs'):
            for rel in (path, 'scripts/releases/v2.4.4.0/variant-overrides/1.3.4.1/' + path):
                dest = ROOT / rel.replace('scripts/releases/v2.4.4.0/', 'scripts/releases/v2.4.4.1/')
                before = subprocess.check_output(['git', '-C', str(ROOT), 'show', BASE + ':' + rel])
                self.assertEqual(dest.read_bytes(), before.replace(b'2.4.4.0', b'2.4.4.1'))

    def test_standard_controls_are_inside_modal_and_hashed(self):
        markup = PickerMarkup()
        markup.feed((NAV / 'index.html').read_text())
        self.assertEqual(markup.controls['file']['type'], 'file')
        self.assertIn('webkitdirectory', markup.controls['folder'])
        self.assertIn('disabled', markup.controls['submit'])
        for asset in CONFIG['asset_checksums']:
            prefix = '/useful/site-navigator/'
            if asset['route'].startswith(prefix):
                file = NAV / (asset['route'][len(prefix):] or 'index.html')
                self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(), asset['sha256'])

    @unittest.skipUnless(importlib.util.find_spec('fcntl'), 'Linux deployment runtime')
    def test_deployment_refuses_stale_or_incomplete_picker(self):
        spec = importlib.util.spec_from_file_location('picker_deploy_test', HERE / 'deploy.py')
        deploy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(deploy)
        self.assertEqual(deploy.runtime.REQUIRES, '2.4.4.0')
        self.assertEqual(deploy.runtime.VERSION, '2.4.4.1')
        self.assertIs(deploy.runtime.verify_https, deploy.verify)
        self.assertEqual(sorted(deploy.runtime.HOOKS), ['prepare'])
        page = (NAV / 'index.html').read_bytes()
        with patch.object(deploy.prior, 'verify') as earlier, patch.object(deploy.runtime, 'run') as run:
            with patch.object(deploy.runtime, 'https', return_value=page):
                deploy.verify()
            earlier.assert_called_once()
            self.assertIn('site_permission_incidents', run.call_args.args[0][-1])
            for bad in (page.replace(b'2.4.4.1', b'2.4.4.0'), page.replace(b'id="basic-choice"', b'')):
                with patch.object(deploy.runtime, 'https', return_value=bad), self.assertRaises(RuntimeError):
                    deploy.verify()


if __name__ == '__main__':
    unittest.main()
