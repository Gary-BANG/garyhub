import importlib.util,json,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[4]
def load(name,path):
    spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
adapter=load('research_adapter',ROOT/'scripts/releases/v1.4.1.0/deploy.py');d=adapter.deployment
legacy=load('research_protection_tests',ROOT/'scripts/releases/v1.3.6.0/tests/deploy.test.py');legacy.d=d
class ProtectionTests(legacy.DeploymentTests):
    def setUp(self):super().setUp();d.configure(self.root,adapter.CONFIG)
class ResearchAdapterTests(unittest.TestCase):
    def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);d.configure(self.root,adapter.CONFIG)
    def tearDown(self):
        if d.LOG:d.LOG.close();d.LOG=None
        self.tmp.cleanup()
    def test_requires_actual_v1401_before_any_build(self):
        (self.root/'manifest.json').write_text(json.dumps({'release':'v1.4.1.0','requires_release':'1.4.0.1','installer_build':'v1.4.1.0-r1','files':{}}))
        with patch.object(d,'image',return_value={}),patch.object(d,'jr',side_effect=['1.4.0.0','1.4.0.0']),patch.object(d,'run')as run:
            with self.assertRaisesRegex(RuntimeError,'requires both services to be deployed v1.4.0.1'):d.locked_main()
            run.assert_not_called()
    def test_health_targets_registered_new_version(self):
        with patch.object(d,'run',return_value=subprocess.CompletedProcess([],0))as run:d.health('fixture',True)
        self.assertIn('1.4.1.0',run.call_args.args[0][-1])
    def fixture(self,host,route):
        folder='calendar-app/public'if host=='calendar.garyhub.uk'else'lab-service/public'
        name=route.split('?')[0].lstrip('/')
        if not name or name.endswith('/'):name+='index.html'
        return (ROOT/folder/name).read_bytes()
    def test_exact_live_assets_and_auth_required(self):
        with patch.object(adapter,'shared_https')as shared,patch.object(d,'https',side_effect=self.fixture),patch.object(d,'run',return_value=subprocess.CompletedProcess([],0,stdout=b'401')):
            adapter.verify_research_https();shared.assert_called_once()
        with patch.object(adapter,'shared_https'),patch.object(d,'https',side_effect=self.fixture),patch.object(d,'run',return_value=subprocess.CompletedProcess([],0,stdout=b'200')):
            with self.assertRaisesRegex(RuntimeError,'authentication check'):adapter.verify_research_https()
    def test_stale_html_or_asset_stops_completion(self):
        with patch.object(adapter,'shared_https'),patch.object(d,'https',return_value=b'old page'):
            with self.assertRaisesRegex(RuntimeError,'link is missing'):adapter.verify_research_https()
        def stale(host,route):return b'stale script'if route.startswith('/research/format.js')else self.fixture(host,route)
        with patch.object(adapter,'shared_https'),patch.object(d,'https',side_effect=stale):
            with self.assertRaisesRegex(RuntimeError,'asset verification'):adapter.verify_research_https()
if __name__=='__main__':unittest.main()
