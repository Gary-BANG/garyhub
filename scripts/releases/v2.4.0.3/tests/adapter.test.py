import hashlib,json,re,subprocess,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.0.3'
CONFIG=json.loads((HERE/'release-config.json').read_text(encoding='utf-8'))
BASE=CONFIG['reviewed_base_commit']
git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT)
# Read what Git stores (the index): a CRLF checkout of an unchanged text file is not a different release.
stored=lambda path:git('show',':'+path.relative_to(ROOT).as_posix())
text=lambda path:stored(path).decode()
class ReleaseTests(unittest.TestCase):
 def test_manifest_and_strict_baseline(self):
  m=json.loads((ROOT/'releases/2.4.0.3.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['requires_release'],'2.4.0.2');self.assertEqual(CONFIG['baseline_adapter'],'scripts/releases/v2.4.0.2')
  self.assertEqual(BASE,m['reviewed_base_commit']);self.assertFalse(m['production_verified'])
  self.assertEqual(CONFIG['installer_build'],'v2.4.0.3-r1');self.assertNotIn('installed_baseline_tree',CONFIG)
  self.assertEqual(json.loads((ROOT/'releases/current.json').read_text())['manifest'],'releases/2.4.0.3.json')
 def test_runtime_and_asset_hashes(self):
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums']:
   for a in CONFIG[group]:
    with self.subTest(host=a['host'],route=a['route']):
     root=ROOT/('calendar-app/public' if a['host']=='calendar.garyhub.uk' else 'lab-service/public')
     if a['host']=='sites.garyhub.uk':root=root/'sites'
     rel=('homepage.html' if a['host']=='garyhub.uk' else 'index.html') if a['route']=='/' else a['route'].lstrip('/')
     if rel=='admin/index.html':rel='admin.html'
     self.assertEqual(hashlib.sha256(stored(root/rel)).hexdigest(),a['sha256'])
  for name,expected in CONFIG['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256(stored(ROOT/'calendar-app/stocks'/name)).hexdigest(),expected)
 def test_shipped_files_keep_stored_line_endings(self):
  # The package takes changed files from the working tree, so they must be the bytes Git stores.
  changed=[p for p in git('diff','--name-only',BASE,'--','calendar-app','lab-service').decode().split() if (ROOT/p).is_file()]
  self.assertIn('lab-service/public/companion/panel.css',changed)
  for path in changed+['scripts/releases/v2.4.0.3/variant-overrides/1.3.4.1/'+rel for rel in ['calendar-app/app.js','lab-service/server.cjs']]:
   with self.subTest(path=path):self.assertEqual((ROOT/path).read_bytes(),stored(ROOT/path))
 def test_capability_variants_only_change_health_version(self):
  for rel in ['calendar-app/app.js','lab-service/server.cjs']:
   for prefix in ['',CONFIG['baseline_adapter']+'/variant-overrides/1.3.4.1/']:
    before=git('show',BASE+':'+prefix+rel).decode()
    expected=before.replace('hubVersion: "2.4.0.2"','hubVersion: "2.4.0.3"').replace('hubVersion:"2.4.0.2"','hubVersion:"2.4.0.3"')
    self.assertNotEqual(before,expected)
    self.assertEqual(expected,text(HERE/'variant-overrides/1.3.4.1'/rel if prefix else ROOT/rel))
 def test_calendar_companion_copy_and_one_asset_version(self):
  for name in ['panel.js','panel.css','pet.js']:
   self.assertEqual(stored(ROOT/'calendar-app/public/companion'/name),stored(ROOT/'lab-service/public/companion'/name))
  leftovers=[p for p in git('grep','-l','-F','2.4.0.2','--','calendar-app','lab-service').decode().split() if p!='calendar-app/releases/garyhub-2.4.0.2.json']
  self.assertEqual(leftovers,[])
 def test_composer_and_outside_dismissal(self):
  js=text(ROOT/'lab-service/public/companion/panel.js');css=text(ROOT/'lab-service/public/companion/panel.css')
  self.assertIn('<textarea rows="1" maxlength="200" autocomplete="off" enterkeyhint="send"></textarea>',js)
  self.assertNotIn('<input type="text"',js)
  self.assertIn("event.key !== 'Enter' || event.shiftKey || event.isComposing || event.keyCode === 229",js)
  self.assertIn('input.maxLength = tutor ? 4000 : aiOn() ? 500 : 200;',js)
  self.assertIn("node.id.startsWith('gh-companion')",js);self.assertIn('close(false);',js)
  self.assertIn('max-height:144px',css);self.assertIn('resize:none',css)
  self.assertIn('onClose:(refocus = true) =>',text(ROOT/'lab-service/public/companion/pet.js'))
 def test_tutor_waits_grow_by_thirty_seconds_and_stay_nested(self):
  api=text(ROOT/'calendar-app/assistant-api.js');tutor=text(ROOT/'calendar-app/assistant-tutor.js');lab=text(ROOT/'lab-service/academic.cjs')
  model=int(re.search(r'TUTOR_ROUND_TIMEOUT = ([\d_]+)',api).group(1).replace('_',''))
  message=int(re.search(r'deadline:Date\.now\(\) \+ (\d+)',tutor).group(1))
  forward=int(re.search(r"verb==='chat'\?(\d+):10000",lab).group(1))
  self.assertEqual([model,message,forward],[105000,140000,160000])
  self.assertIn('Math.min(call.tutor ? TUTOR_ROUND_TIMEOUT : ROUND_TIMEOUT, left)',api)
  # Ordinary chat keeps its own limits, and the one-hour consent is unchanged.
  self.assertIn('ROUND_TIMEOUT = 25_000, SEARCH_TIMEOUT = 15_000, REQUEST_BUDGET = 110_000',api)
  self.assertIn('TTL = 60 * 60_000',tutor);self.assertIn('slow?130000:10000',text(ROOT/'lab-service/server.cjs'))
 def test_elsewhere_links_open_new_tabs(self):
  page=text(ROOT/'lab-service/public/sites/index.html')
  links=re.findall(r'<a class="site" href="(https://[^"]+)" data-thumb="[^"]+" target="_blank" rel="noopener">',page)
  self.assertEqual(len(links),2);self.assertEqual(len(re.findall(r'<a class="site" ',page)),2)
  self.assertIn('<a href="https://sites.garyhub.uk/" target="_blank" rel="noopener">',text(ROOT/'lab-service/public/homepage.html'))
 def test_shared_runtime_and_isolation_inputs(self):
  self.assertEqual(len(CONFIG['isolation_checks']),10)
  for path in list(CONFIG['test_inputs'].values())+list(CONFIG['support_files'].values()):self.assertTrue((ROOT/path).is_file())
  self.assertEqual(CONFIG['test_inputs']['asset-checks.json'],'scripts/releases/v2.4.0.3/release-config.json')
  self.assertIn('from build_overlay import build',(HERE/'build-package.py').read_text())
  deploy=(HERE/'deploy.py').read_text()
  self.assertIn('runtime.configure(ROOT, CONFIG)',deploy)
  for needle in ['deadline:Date.now() + 140000','TUTOR_ROUND_TIMEOUT = 105_000',"verb==='chat'?160000:10000"]:self.assertIn(needle,deploy)
  self.assertNotIn('host_hooks',CONFIG)
  self.assertEqual(git('diff','--name-only',BASE,'--','scripts/updater').decode().strip(),'')
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('Multi-line companion input, click-outside dismissal, longer study Q&A waits and new-tab Elsewhere links are ready.',s)
  for stale in ['A-share','VIP','fuzzy','GLM']:self.assertNotIn(stale,s)
  self.assertIn('-PrepareOnly',s);self.assertIn('preserving all current records',s)
 def test_scoped_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.0.3.json').read_text(encoding='utf-8'));self.assertEqual(r['version'],'garyhub-2.4.0.3');self.assertEqual(r['date'],'2026-11-10')
  self.assertEqual([n['scope'] for n in r['notes']],['home','tools'])
  self.assertTrue(all(n['title'] and n['body'] for n in r['notes']))
if __name__=='__main__':unittest.main()
