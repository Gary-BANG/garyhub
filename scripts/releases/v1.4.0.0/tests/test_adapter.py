"""Exercise the new adapter while inheriting the established rollback regressions."""
import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[4]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
adapter=load('dock_release',ROOT/'scripts/releases/v1.4.0.0/deploy.py')
d=adapter.deployment
config=json.loads((ROOT/'scripts/releases/v1.4.0.0/release-config.json').read_text())
legacy=load('original_dock_protections',ROOT/'scripts/releases/v1.3.6.0/tests/deploy.test.py')
legacy.d=d

class InheritedProtectionTests(legacy.DeploymentTests):
    def setUp(self):
        super().setUp();d.configure(self.root,config)

class DockAdapterTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);d.configure(self.root,config)
    def tearDown(self):
        if d.LOG:d.LOG.close();d.LOG=None
        self.tmp.cleanup()
    def test_wrong_or_mixed_live_version_stops_before_build(self):
        (self.root/'manifest.json').write_text(json.dumps({'release':'v1.4.0.0','requires_release':'1.3.6.1','installer_build':config['installer_build'],'files':{}}))
        for i,versions in enumerate([['1.3.6.0','1.3.6.0'],['1.3.6.1','1.3.6.0']]):
            with patch.object(d.time,'strftime',return_value='fixture-'+str(i)),patch.object(d,'image',return_value={}),patch.object(d,'jr',side_effect=versions),patch.object(d,'run') as run:
                with self.assertRaisesRegex(RuntimeError,'requires both services to be deployed v1.3.6.1'):d.locked_main()
                run.assert_not_called()
            d.LOG.close();d.LOG=None
    def test_new_health_version(self):
        with patch.object(d,'run',return_value=subprocess.CompletedProcess([],0)) as run:d.health('synthetic',True)
        self.assertIn('1.4.0.0',run.call_args.args[0][-1]);self.assertNotIn('1.3.6.1',run.call_args.args[0][-1])
    def test_dock_https_reuses_existing_checks_then_checks_every_new_asset(self):
        html=(ROOT/'lab-service/public/index.html').read_bytes()
        with patch.object(adapter,'shared_https') as base,patch.object(d,'https',side_effect=lambda host,route:html if route=='/'else b'fixture') as https:
            adapter.verify_dock_https();base.assert_called_once();self.assertEqual(https.call_count,4)
        with patch.object(adapter,'shared_https'),patch.object(d,'https',return_value=b'old page'):
            with self.assertRaisesRegex(RuntimeError,'markup is incomplete'):adapter.verify_dock_https()
    def test_missing_asset_stops_https_verification(self):
        html=(ROOT/'lab-service/public/index.html').read_bytes()
        with patch.object(adapter,'shared_https'),patch.object(d,'https',side_effect=lambda host,route:html if route=='/'else b''):
            with self.assertRaisesRegex(RuntimeError,'asset is missing'):adapter.verify_dock_https()
    def test_old_adapters_and_background_are_unchanged(self):
        base=config['reviewed_base_commit']
        for path in ['scripts/releases/v1.3.6.1/release-config.json','scripts/releases/v1.3.6.1/deploy.py','scripts/updater/deploy_runtime.py','lab-service/public/hub.js','lab-service/public/hub.css']:
            expected=subprocess.check_output(['git','-C',str(ROOT),'show',base+':'+path])
            self.assertEqual(expected,(ROOT/path).read_bytes(),path)

if __name__=='__main__':unittest.main()
