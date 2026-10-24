import importlib.util
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[4]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
a=load('hover_adapter',ROOT/'scripts/releases/v1.4.0.1/deploy.py');d=a.deployment
legacy=load('hover_protections',ROOT/'scripts/releases/v1.3.6.0/tests/deploy.test.py');legacy.d=d
class ProtectionTests(legacy.DeploymentTests):
    def setUp(self):super().setUp();d.configure(self.root,a.CONFIG)
class HoverAdapterTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);d.configure(self.root,a.CONFIG)
    def tearDown(self):
        if d.LOG:d.LOG.close();d.LOG=None
        self.tmp.cleanup()
    def test_only_v1400_is_accepted_before_build(self):
        (self.root/'manifest.json').write_text(json.dumps({'release':'v1.4.0.1','requires_release':'1.4.0.0','installer_build':'v1.4.0.1-r1','files':{}}))
        with patch.object(d,'image',return_value={}),patch.object(d,'jr',side_effect=['1.3.6.1','1.3.6.1']),patch.object(d,'run')as run:
            with self.assertRaisesRegex(RuntimeError,'requires both services to be deployed v1.4.0.0'):d.locked_main()
            run.assert_not_called()
    def test_new_health_version(self):
        with patch.object(d,'run',return_value=subprocess.CompletedProcess([],0))as run:d.health('fixture',True)
        self.assertIn('1.4.0.1',run.call_args.args[0][-1])
    def test_live_assets_must_equal_the_reviewed_fix(self):
        html=(ROOT/'lab-service/public/index.html').read_bytes()
        def content(host,route):return html if route=='/'else (ROOT/'lab-service/public'/route.split('?')[0].lstrip('/')).read_bytes()
        with patch.object(a,'shared_https')as shared,patch.object(d,'https',side_effect=content):a.verify_hover_https();shared.assert_called_once()
        with patch.object(a,'shared_https'),patch.object(d,'https',side_effect=lambda host,route:html if route=='/'else b'stale asset'):
            with self.assertRaisesRegex(RuntimeError,'asset verification failed'):a.verify_hover_https()
    def test_stale_page_is_rejected(self):
        with patch.object(a,'shared_https'),patch.object(d,'https',return_value=b'old HTML'):
            with self.assertRaisesRegex(RuntimeError,'HTML is not current'):a.verify_hover_https()
if __name__=='__main__':unittest.main()
