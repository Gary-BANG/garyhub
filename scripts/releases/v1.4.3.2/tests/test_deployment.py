"""Strict new baseline, capability overlays and reviewed asset protections."""
import hashlib,importlib.util,json,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[4]
HERE=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('deploy1432',HERE/'deploy.py')
adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)

class ReleaseTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);adapter.d.configure(self.root,adapter.CONFIG)
 def tearDown(self):
  if adapter.d.LOG:adapter.d.LOG.close();adapter.d.LOG=None
  self.temp.cleanup()
 def test_both_services_must_be_actual_1431_before_mutation(self):
  for i,versions in enumerate([['1.4.3.0','1.4.3.0'],['1.4.3.1','1.4.3.0'],['1.4.3.2','1.4.3.2']]):
   folder=self.root/str(i);folder.mkdir();adapter.d.configure(folder,adapter.CONFIG)
   (folder/'manifest.json').write_text(json.dumps({'release':'v1.4.3.2','requires_release':'1.4.3.1','installer_build':'v1.4.3.2-r1','files':{}}))
   with patch.object(adapter.d,'image',return_value={}),patch.object(adapter.d,'jr',side_effect=versions),patch.object(adapter.d,'run') as run:
    with self.assertRaisesRegex(RuntimeError,'both services to be deployed v1.4.3.1'):adapter.d.locked_main()
    run.assert_not_called()
   if adapter.d.LOG:adapter.d.LOG.close();adapter.d.LOG=None
 def test_health_and_rollback_use_this_release_configuration(self):
  with patch.object(adapter.d,'run',return_value=subprocess.CompletedProcess([],0)) as run:adapter.d.health('fixture',True)
  self.assertIn('1.4.3.2',run.call_args.args[0][-1])
  with patch.object(adapter.d,'image',return_value={'Image':'later'}),patch.object(adapter.d,'old_up') as up:
   with self.assertRaisesRegex(RuntimeError,'changed after this release'):adapter.d.restore({'services':{'calendar-app':{'name':'calendar-app','new_image_id':'candidate'}}},True)
   up.assert_not_called()
 def test_asset_digests_match_reviewed_files_and_cover_all_modified_ui(self):
  routes=set()
  for asset in adapter.CONFIG['asset_checksums']+adapter.CONFIG['protected_asset_checksums']:
   routes.add(asset['route']);file=ROOT/'lab-service/public'/asset['route'].lstrip('/')
   self.assertEqual(hashlib.sha256(file.read_bytes()).hexdigest(),asset['sha256'])
  self.assertTrue({'/lab/app.js','/lab/math-markdown.mjs','/lab/index.html','/academic/index.html','/ambient-music.js','/useful/tool-shell.js','/useful/image-eraser/index.html','/useful/markdown-viewer/index.html','/useful/pdf-gray/index.html'}.issubset(routes))
 def test_bad_public_asset_is_rejected(self):
  with patch.object(adapter,'shared'),patch.object(adapter.d,'https',return_value=b'wrong'):
   with self.assertRaisesRegex(RuntimeError,'asset mismatch'):adapter.verify()
 def test_protected_asset_cannot_lose_file_hash_or_login_gate(self):
  asset=adapter.CONFIG['protected_asset_checksums'][0]
  with patch.object(adapter.d,'run',return_value=subprocess.CompletedProcess([],0,b'incorrect')):
   with self.assertRaisesRegex(RuntimeError,'asset mismatch in running container'):adapter.protected_asset(asset)
  for status in [b'HTTP/2 200\r\n',b'HTTP/2 302\r\nLocation: https://evil.invalid/\r\n']:
   with patch.object(adapter.d,'run',side_effect=[subprocess.CompletedProcess([],0,asset['sha256'].encode()),subprocess.CompletedProcess([],0,status)]):
    with self.assertRaisesRegex(RuntimeError,'login gate failed'):adapter.protected_asset(asset)
 def test_no_totp_overlay_changes_only_health_and_narrow_media_csp(self):
  for relative in ['calendar-app/app.js','lab-service/server.cjs']:
   path=Path('variant-overrides/1.3.4.1')/relative
   old=(ROOT/'scripts/releases/v1.4.3.1'/path).read_text()
   expected=old.replace('hubVersion: "1.4.3.1"','hubVersion: "1.4.3.2"').replace('hubVersion:"1.4.3.1"','hubVersion:"1.4.3.2"')
   if relative.endswith('server.cjs'):expected=expected.replace("connect-src 'self'; object-src","connect-src 'self'; media-src 'self' https://*.r2.cloudflarestorage.com; object-src")
   self.assertEqual((HERE/path).read_text(),expected)
 def test_strict_base_does_not_register_legacy_repair_or_host_hooks(self):
  self.assertEqual(adapter.d.HOOKS,{})
  self.assertEqual(adapter.CONFIG['requires_release'],'1.4.3.1')
  self.assertEqual(adapter.CONFIG['baseline_adapter'],'scripts/releases/v1.4.3.1')
  self.assertNotIn('rollback_recovery',adapter.CONFIG)
 def test_player_is_shared_and_library_is_opt_out_only(self):
  a=(ROOT/'lab-service/public/ambient-music.js').read_bytes();b=(ROOT/'calendar-app/public/ambient-music.js').read_bytes();self.assertEqual(a,b)
  self.assertIn(b"config.musicLibrary!=='false'",a)
  self.assertIn(b"if(!target&&!document.getElementById('sky'))return",a)
if __name__=='__main__':unittest.main()
