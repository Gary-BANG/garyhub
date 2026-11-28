"""Validate the strict preceding installation, both variants and served navigation controls."""
import gzip
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parents[2]
CFG = json.loads((HERE / 'release-config.json').read_text())
PREV = ROOT / CFG['baseline_adapter']


def git(*args, env=None, data=None):
    return subprocess.run(['git', '-C', str(ROOT), *args], input=data, env=env,
                          check=True, stdout=subprocess.PIPE).stdout


class ReleaseTests(unittest.TestCase):
    def test_installed_tree_and_variant_entrypoints(self):
        with TemporaryDirectory() as tmp:
            env = {**os.environ, 'GIT_INDEX_FILE': str(Path(tmp) / 'index')}
            git('read-tree', CFG['reviewed_base_commit'], env=env)
            git('apply', '--cached', '--binary', '-', env=env,
                data=gzip.decompress((HERE/'installed-baseline.patch.gz').read_bytes()))
            tree = git('write-tree', env=env).decode().strip()
            self.assertEqual(tree, CFG['installed_baseline_tree'])
            for service in ('calendar-app/app.js', 'lab-service/server.cjs'):
                for parent in (None, 'variant-overrides/1.3.4.1'):
                    new = HERE/parent/service if parent else ROOT/service
                    before = PREV/parent/service if parent else ROOT/service
                    old = git('show', tree + ':' + before.relative_to(ROOT).as_posix())
                    self.assertEqual(new.read_bytes(), old.replace(b'2.4.4.1', b'2.4.4.2'))

    def test_registers_release_and_retains_isolation_checks(self):
        prev = json.loads((PREV/'release-config.json').read_text())
        registry = json.loads((ROOT/'releases/2.4.4.2.json').read_text())
        self.assertEqual(CFG['requires_release'], '2.4.4.1')
        self.assertTrue(CFG['support_installed_source_checkpoint'])
        self.assertEqual(CFG['installed_baseline_tree'], registry['installed_baseline_tree'])
        self.assertEqual(CFG['isolation_checks'], prev['isolation_checks'])
        notice = json.loads((ROOT/'calendar-app/releases/garyhub-2.4.4.2.json').read_text())
        self.assertEqual([n['scope'] for n in notice['notes']], ['tools'])

    def test_checked_browser_assets(self):
        prefix = '/useful/site-navigator/'
        assets = [a for a in CFG['asset_checksums'] if a['host']=='tools.garyhub.uk' and a['route'].startswith(prefix)]
        paths = {a['route'][len(prefix):] or 'index.html': a['sha256'] for a in assets}
        for name in ('index.html', 'navigator.mjs', 'navigator.css', 'permissions.mjs','sources.mjs','viewer.mjs'):
            self.assertEqual(hashlib.sha256((ROOT/'lab-service/public'/prefix.strip('/')/name).read_bytes()).hexdigest(),
                             paths[name])

    @unittest.skipUnless(importlib.util.find_spec('fcntl'), 'deployment runtime is Linux')
    def test_served_copy_controls_and_shared_verifier(self):
        spec = importlib.util.spec_from_file_location('copy_deploy', HERE/'deploy.py')
        deploy = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(deploy)
        self.assertEqual((deploy.runtime.REQUIRES,deploy.runtime.VERSION), ('2.4.4.1','2.4.4.2'))
        self.assertIs(deploy.runtime.verify_https, deploy.verify)
        self.assertEqual(sorted(deploy.runtime.HOOKS), ['prepare'])
        html=(ROOT/'lab-service/public/useful/site-navigator/index.html').read_bytes()
        with patch.object(deploy.prior,'verify') as existing, patch.object(deploy.runtime,'https',return_value=html) as served:
            deploy.verify()
            existing.assert_called_once()
            served.assert_called_with('tools.garyhub.uk','/useful/site-navigator/?v=2.4.4.2')
            served.return_value=html.replace(b'id="keep-copy"',b'')
            with self.assertRaises(RuntimeError):
                deploy.verify()


if __name__ == '__main__':
    unittest.main()
