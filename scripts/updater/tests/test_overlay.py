"""Synthetic regressions for the shared release runtime and package inputs."""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[3]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
d=load('shared_deployment',ROOT/'scripts/updater/deploy_runtime.py')
b=load('shared_builder',ROOT/'scripts/updater/build_overlay.py')
config=json.loads((ROOT/'scripts/releases/v1.3.6.1/release-config.json').read_text())
legacy=load('original_deployment_tests',ROOT/'scripts/releases/v1.3.6.0/tests/deploy.test.py')
legacy.d=d

class InheritedProtectionTests(legacy.DeploymentTests):
    def setUp(self):
        super().setUp();d.configure(self.root,config)

class AdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);d.configure(self.root,config)
    def tearDown(self):
        if d.LOG:d.LOG.close();d.LOG=None
        self.tmp.cleanup()
    def test_wrong_live_version_stops_before_build_or_cutover(self):
        (self.root/'manifest.json').write_text(json.dumps({'release':'v1.3.6.1','requires_release':'1.3.6.0','installer_build':config['installer_build'],'files':{}}))
        with patch.object(d,'image',return_value={}),patch.object(d,'jr',side_effect=['1.3.5.4','1.3.5.4']),patch.object(d,'run') as run:
            with self.assertRaisesRegex(RuntimeError,'requires both services to be deployed v1.3.6.0'):d.locked_main()
            run.assert_not_called()
    def test_health_uses_configured_target_version(self):
        with patch.object(d,'run',return_value=subprocess.CompletedProcess([],0)) as run:
            d.health('synthetic',True)
        script=run.call_args.args[0][-1]
        self.assertIn('1.3.6.1',script);self.assertNotIn('1.3.6.0',script)
    def test_manual_rollback_preserves_later_deployments(self):
        with patch.object(d,'image',return_value={'Image':'later'}),patch.object(d,'old_up') as up:
            with self.assertRaisesRegex(RuntimeError,'changed after this release'):d.restore({'services':{'calendar-app':{'name':'calendar-app','new_image_id':'new'}}},True)
            up.assert_not_called()
    def test_package_inputs_refuse_private_files_and_linked_parent_directories(self):
        (self.root/'file.js').write_text('public fixture');(self.root/'.env').write_text('synthetic-only')
        (self.root/'linked').symlink_to(self.root,target_is_directory=True)
        for path in ['.env','../outside','linked/file.js']:
            with self.assertRaises(RuntimeError):b.source_bytes(self.root,path)
        self.assertEqual(b.source_bytes(self.root,'file.js'),b'public fixture')

if __name__=='__main__':unittest.main()
