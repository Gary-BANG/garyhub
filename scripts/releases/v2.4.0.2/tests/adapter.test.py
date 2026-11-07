import hashlib,importlib.util,json,subprocess,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.0.2'
class ReleaseTests(unittest.TestCase):
 def test_manifest_and_strict_baseline(self):
  c=json.loads((HERE/'release-config.json').read_text());m=json.loads((ROOT/'releases/2.4.0.2.json').read_text())
  self.assertEqual(c['requires_release'],'2.4.0.1');self.assertEqual(c['baseline_adapter'],'scripts/releases/v2.4.0.1')
  self.assertEqual(c['reviewed_base_commit'],m['reviewed_base_commit']);self.assertFalse(m['production_verified'])
  self.assertEqual(c['installer_build'],'v2.4.0.2-r1');self.assertNotIn('installed_baseline_tree',c)
 def test_runtime_and_asset_hashes(self):
  c=json.loads((HERE/'release-config.json').read_text())
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums']:
   for a in c[group]:
    with self.subTest(host=a['host'],route=a['route']):
     root=ROOT/('calendar-app/public' if a['host']=='calendar.garyhub.uk' else 'lab-service/public')
     if a['host']=='sites.garyhub.uk':root=root/'sites'
     rel=('homepage.html' if a['host']=='garyhub.uk' else 'index.html') if a['route']=='/' else a['route'].lstrip('/')
     if rel=='admin/index.html':rel='admin.html'
     self.assertEqual(hashlib.sha256((root/rel).read_bytes()).hexdigest(),a['sha256'])
  for name,expected in c['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256((ROOT/'calendar-app/stocks'/name).read_bytes()).hexdigest(),expected)
 def test_capability_variants_only_change_health_and_vip_proxy(self):
  c=json.loads((HERE/'release-config.json').read_text())
  for rel in ['calendar-app/app.js','lab-service/server.cjs']:
   for prefix in ['',c['baseline_adapter']+'/variant-overrides/1.3.4.1/']:
    before=subprocess.check_output(['git','show',c['reviewed_base_commit']+':'+prefix+rel],cwd=ROOT).decode()
    expected=before.replace('hubVersion: "2.4.0.1"','hubVersion: "2.4.0.2"').replace('hubVersion:"2.4.0.1"','hubVersion:"2.4.0.2"')
    if rel.endswith('server.cjs'):expected=expected.replace('deletion-preview|tier)','deletion-preview|tier|stock-vip)')
    target=HERE/'variant-overrides/1.3.4.1'/rel if prefix else ROOT/rel
    self.assertEqual(expected,target.read_text())
 def test_shared_runtime_and_isolation_inputs(self):
  c=json.loads((HERE/'release-config.json').read_text());self.assertEqual(len(c['isolation_checks']),10)
  for path in c['test_inputs'].values():self.assertTrue((ROOT/path).is_file())
  self.assertIn('from build_overlay import build',(HERE/'build-package.py').read_text())
  self.assertIn('runtime.configure(ROOT, CONFIG)',(HERE/'deploy.py').read_text())
  self.assertNotIn('host_hooks',c)
  changed=subprocess.check_output(['git','diff','--name-only',c['reviewed_base_commit'],'--','scripts/updater'],cwd=ROOT).decode().strip();self.assertEqual(changed,'')
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('day/night themes and VIP controls',s)
  self.assertIn('-PrepareOnly',s);self.assertIn('preserving all current records',s)
 def test_scoped_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.0.2.json').read_text());self.assertEqual(r['version'],'garyhub-2.4.0.2');self.assertEqual(r['date'],'2026-11-06')
  self.assertTrue(r['notes']);self.assertTrue(all(n['scope']=='tools' for n in r['notes']))
if __name__=='__main__':unittest.main()
