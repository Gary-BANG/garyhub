import hashlib,json,subprocess,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.3.1.0'
class ReleaseTests(unittest.TestCase):
 def test_manifest_baseline(self):
  c=json.loads((HERE/'release-config.json').read_text());m=json.loads((ROOT/'releases/2.3.1.0.json').read_text())
  self.assertEqual(c['requires_release'],'2.3.0.4');self.assertEqual(c['baseline_adapter'],'scripts/releases/v2.3.0.4')
  self.assertEqual(c['reviewed_base_commit'],m['reviewed_base_commit']);self.assertFalse(m['production_verified'])
  self.assertEqual(c['installer_build'],'v2.3.1.0-r1')
 def test_assets(self):
  c=json.loads((HERE/'release-config.json').read_text())
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums']:
   for a in c[group]:
    with self.subTest(host=a['host'],route=a['route']):
     root=ROOT/('calendar-app/public' if a['host']=='calendar.garyhub.uk' else 'lab-service/public')
     if a['host']=='sites.garyhub.uk':root=root/'sites'
     rel=('homepage.html' if a['host']=='garyhub.uk' else 'index.html') if a['route']=='/' else a['route'].lstrip('/')
     self.assertEqual(hashlib.sha256((root/rel).read_bytes()).hexdigest(),a['sha256'])
 def test_variants_preserve_capabilities(self):
  base=json.loads((HERE/'release-config.json').read_text())['reviewed_base_commit']
  for rel in ['calendar-app/app.js','lab-service/server.cjs']:
   for variant in ['', 'scripts/releases/v2.3.0.4/variant-overrides/1.3.4.1/']:
    before=subprocess.check_output(['git','show',base+':'+variant+rel],cwd=ROOT).decode()
    expected=before.replace('hubVersion: "2.3.0.4"','hubVersion: "2.3.1.0"').replace('hubVersion:"2.3.0.4"','hubVersion:"2.3.1.0"')
    if rel.endswith('app.js'):expected=expected.replace('app.use(express.json());','app.use("/api/assistant/tutor",express.json({limit:"256kb"}));\napp.use(express.json());')
    target=HERE/'variant-overrides/1.3.4.1'/rel if variant else ROOT/rel
    self.assertEqual(expected,target.read_text())
 def test_isolation_and_shared_runtime(self):
  c=json.loads((HERE/'release-config.json').read_text());self.assertEqual(len(c['isolation_checks']),9)
  self.assertIn('tutor-http.cjs',c['isolation_checks'])
  for path in c['test_inputs'].values():self.assertTrue((ROOT/path).is_file())
  self.assertIn('from build_overlay import build',(HERE/'build-package.py').read_text())
  self.assertIn('updater/deploy_runtime.py',(HERE/'deploy.py').read_text())
  self.assertNotIn('host_hooks',c)
 def test_installer(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('Study Q&A',s);self.assertNotIn('14 days',s)
 def test_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.3.1.0.json').read_text())
  self.assertEqual(r['version'],'garyhub-2.3.1.0');self.assertTrue(r['notes']);self.assertEqual(r['date'],'2026-11-04')
  self.assertTrue(all(n['scope'] in ['home','calendar','tools','access','lab'] for n in r['notes']))
if __name__=='__main__':unittest.main()
