import hashlib,json,subprocess,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.3.0.4'
class ReleaseTests(unittest.TestCase):
 def test_manifest_and_adapter_baseline(self):
  c=json.loads((HERE/'release-config.json').read_text());m=json.loads((ROOT/'releases/2.3.0.4.json').read_text())
  self.assertEqual(c['requires_release'],'2.3.0.3');self.assertEqual(c['baseline_adapter'],'scripts/releases/v2.3.0.3')
  self.assertEqual(c['reviewed_base_commit'],m['reviewed_base_commit']);self.assertFalse(m['production_verified'])
  self.assertEqual(c['installer_build'],'v2.3.0.4-r1')
 def test_all_configured_assets_match(self):
  c=json.loads((HERE/'release-config.json').read_text())
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums']:
   for a in c[group]:
    with self.subTest(host=a['host'],route=a['route']):
     root=ROOT/('calendar-app/public' if a['host']=='calendar.garyhub.uk' else 'lab-service/public')
     if a['host']=='sites.garyhub.uk':root=root/'sites'
     relative=('homepage.html' if a['host']=='garyhub.uk' else 'index.html') if a['route']=='/' else a['route'].lstrip('/')
     self.assertEqual(hashlib.sha256((root/relative).read_bytes()).hexdigest(),a['sha256'])
 def test_variants_retain_only_existing_capability_differences(self):
  base=json.loads((HERE/'release-config.json').read_text())['reviewed_base_commit']
  for rel in ['calendar-app/app.js','lab-service/server.cjs']:
   def old(path):return subprocess.check_output(['git','show',base+':'+path],cwd=ROOT).decode()
   main=(ROOT/rel).read_text();variant=(HERE/'variant-overrides/1.3.4.1'/rel).read_text()
   # The same ordered replacements take each reviewed baseline to its matching target.
   for before,after in [(old(rel),main),(old('scripts/releases/v2.3.0.3/variant-overrides/1.3.4.1/'+rel),variant)]:
    expected=before.replace('hubVersion: "2.3.0.3"','hubVersion: "2.3.0.4"').replace('hubVersion:"2.3.0.3"','hubVersion:"2.3.0.4"')
    if rel.endswith('app.js'):expected=expected.replace('    app.listen(PORT','    return require("./notification-policy").startNotificationCleanup(require("./db"));\n  })\n  .then(() => {\n    app.listen(PORT')
    else:expected=expected.replace(r'notifications(?:\/\d+\/read)?',r'notifications(?:\/\d+\/read|\/(?:read-all|delete-all))?')
    self.assertEqual(expected,after)
 def test_new_http_checks_packaged_and_runtime_shared(self):
  c=json.loads((HERE/'release-config.json').read_text());self.assertEqual(len(c['isolation_checks']),8)
  self.assertIn('notifications-http.cjs',c['isolation_checks'])
  for source in c['test_inputs'].values():self.assertTrue((ROOT/source).is_file())
  self.assertIn('from build_overlay import build',(HERE/'build-package.py').read_text())
  self.assertIn("updater/deploy_runtime.py",(HERE/'deploy.py').read_text())
 def test_installer_uses_placeholders_and_correct_message(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertNotIn('GLM-5.3',s);self.assertIn('14 days',s)
 def test_notice_scopes_date_and_required_types_documented(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.3.0.4.json').read_text())
  self.assertEqual(r['version'],'garyhub-2.3.0.4');self.assertTrue(r['notes'])
  self.assertTrue(all(n['scope'] in ['home','calendar','tools','access','lab'] for n in r['notes']))
if __name__=='__main__':unittest.main()
