import hashlib,importlib.util,json,re,subprocess,unittest
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.1.0'
CONFIG=json.loads((HERE/'release-config.json').read_text(encoding='utf-8'))
BASE=CONFIG['reviewed_base_commit']
git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT)
# Read what Git stores (the index): a CRLF checkout of an unchanged text file is not a different release.
stored=lambda path:git('show',':'+path.relative_to(ROOT).as_posix())
text=lambda path:stored(path).decode()
PERSONAL=re.compile(r'ZJUI|Zhejiang|Urbana|2028|Multi-UAV|Intelligent Assistants|data-profile-fragment|该部分已隐藏',re.I)
PRIVATE=ROOT/'lab-service/developer-profile.json'
def local(a):
 base=ROOT/('calendar-app/public' if a['host']=='calendar.garyhub.uk' else 'lab-service/public')
 if a['host']=='sites.garyhub.uk':base=base/'sites'
 route=a['route']
 rel=('homepage.html' if a['host']=='garyhub.uk' else 'index.html') if route=='/' else route.lstrip('/')+'index.html' if route.endswith('/') else route.lstrip('/')
 return base/('admin.html' if rel=='admin/index.html' else rel)
class ReleaseTests(unittest.TestCase):
 def test_manifest_and_strict_baseline(self):
  m=json.loads((ROOT/'releases/2.4.1.0.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['requires_release'],'2.4.0.4');self.assertEqual(CONFIG['baseline_adapter'],'scripts/releases/v2.4.0.4')
  self.assertEqual(BASE,m['reviewed_base_commit']);self.assertFalse(m['production_verified'])
  self.assertEqual(BASE,'97ad2f22761547f216b0794915debb1ac3cfc17e')
  self.assertEqual(CONFIG['installer_build'],'v2.4.1.0-r1');self.assertEqual(m['installer_revision'],'r1');self.assertNotIn('installed_baseline_tree',CONFIG)
  self.assertEqual(json.loads((ROOT/'releases/current.json').read_text())['manifest'],'releases/2.4.1.0.json')
 def test_runtime_and_asset_hashes(self):
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums']:
   for a in CONFIG[group]:
    with self.subTest(host=a['host'],route=a['route']):self.assertEqual(hashlib.sha256(stored(local(a))).hexdigest(),a['sha256'])
  routes={a['route'] for a in CONFIG['asset_checksums'] if a['host']=='garyhub.uk'}
  for route in ['/','/developer/','/home/cosmos.js','/home/site.js','/home/site.css','/home/home.css','/developer/developer.js','/developer/developer.css']:self.assertIn(route,routes)
  for name,expected in CONFIG['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256(stored(ROOT/'calendar-app/stocks'/name)).hexdigest(),expected)
 def test_shipped_files_keep_stored_line_endings(self):
  changed=[p for p in git('diff','--name-only',BASE,'--','calendar-app','lab-service').decode().split() if (ROOT/p).is_file()]
  self.assertIn('lab-service/public/developer/developer.js',changed)
  for path in changed+['scripts/releases/v2.4.1.0/variant-overrides/1.3.4.1/'+rel for rel in ['calendar-app/app.js','lab-service/server.cjs']]:
   with self.subTest(path=path):self.assertEqual((ROOT/path).read_bytes(),stored(ROOT/path))
 def test_capability_variant_matches_the_main_server_changes(self):
  # The 1.3.4.1 override differs from v2.4.0.4's only by the same edits made to the main files.
  for rel in ['calendar-app/app.js','lab-service/server.cjs']:
   main_before=git('show',BASE+':'+rel).decode();main_after=text(ROOT/rel)
   variant_before=git('show',BASE+':scripts/releases/v2.4.0.4/variant-overrides/1.3.4.1/'+rel).decode();variant_after=text(HERE/'variant-overrides/1.3.4.1'/rel)
   self.assertNotEqual(main_before,main_after)
   import difflib
   delta=lambda a,b:[l for l in difflib.unified_diff(a.splitlines(),b.splitlines(),lineterm='',n=0) if l[:1] in '+-' and l[:3] not in ('+++','---')]
   self.assertEqual(delta(main_before,main_after),delta(variant_before,variant_after),rel)
  self.assertIn('hubVersion:"2.4.1.0"',text(ROOT/'lab-service/server.cjs'))
 def test_companion_copies_and_one_asset_version(self):
  for name in ['knowledge.js','panel.js','panel.css','pet.js']:
   self.assertEqual(stored(ROOT/'calendar-app/public/companion'/name),stored(ROOT/'lab-service/public/companion'/name))
  leftovers=[p for p in git('grep','-l','-F','2.4.0.4','--','calendar-app','lab-service').decode().split() if not p.startswith('calendar-app/releases/')]
  self.assertEqual(leftovers,[])
  self.assertIn("{id:'developer', url:'https://garyhub.uk/developer/', access:'public',",text(ROOT/'lab-service/public/companion/knowledge.js'))
  self.assertIn("[path.join(lab, 'developer/index.html')]:'quiet'",text(ROOT/'lab-service/test/companion-wiring.test.cjs'))
 def test_homepage_has_no_personal_text_and_links_the_developer_page(self):
  home=text(ROOT/'lab-service/public/homepage.html')
  self.assertIsNone(PERSONAL.search(home))
  for gone in ['profile-privacy.js','profileUnlock','profile-placeholder']:self.assertNotIn(gone,home)
  for marker in ['<canvas data-cosmos="full">','<a href="/developer/"><strong>Developer Profile</strong>','<a href="https://sites.garyhub.uk/" target="_blank" rel="noopener"><strong>Elsewhere ↗</strong>','<script src="/companion/boot.js?v=2.4.1.0" defer data-companion="open"></script>']:self.assertIn(marker,home)
  self.assertEqual(home.count('class="portal '),4)
  page=text(ROOT/'lab-service/public/developer/index.html');self.assertIsNone(PERSONAL.search(page))
  for path in ['lab-service/public/developer/developer.js','lab-service/public/home/cosmos.js','lab-service/public/home/site.js']:self.assertIsNone(PERSONAL.search(text(ROOT/path)),path)
 def test_developer_page_never_mentions_hidden_parts(self):
  js=text(ROOT/'lab-service/public/developer/developer.js');page=text(ROOT/'lab-service/public/developer/index.html')
  words=js[js.index('const TEXT={'):js.index(' const lang=')]
  for source in [words,page]:
   self.assertNotIn('隐藏',source);self.assertNotRegex(source,r'(?i)\bhidden (part|section|content)|\bis hidden|\bare hidden')
  self.assertIn("denied:{zh:'你无权访问'",js)
  # Sections are numbered from what the server returned, never from a fixed list.
  self.assertIn("present.forEach((key,i)=>",js);self.assertIn("String(i+1).padStart(2,'0')",js)
  self.assertIn("if(!profile.identity&&!present.length)frag.append(denied(access));",js)
  self.assertNotIn('innerHTML=d',js);self.assertEqual(js.count('innerHTML'),1)  # only the static lock icon
 def test_server_filters_sections_and_serves_the_page_on_the_homepage_host(self):
  privacy=text(ROOT/'lab-service/homepage-privacy.cjs')
  self.assertIn("if(access.allowed.includes(key)&&profile[key]&&typeof profile[key]==='object')",privacy)
  self.assertIn("complete:access.allowed.length===5",privacy)
  for leak in ['protected:access','revision:access']:self.assertNotIn(leak,privacy)
  server=text(ROOT/'lab-service/server.cjs')
  self.assertIn("if(!isHome&&/^\\/developer(?:\\/|$)/i.test(url.pathname))return json(res,404,{message:'Not found'});",server)
  self.assertIn("'/developer/','/developer/index.html','/developer/developer.css','/developer/developer.js','/home/site.css','/home/home.css','/home/cosmos.js','/home/site.js'",server)
  self.assertLess(server.index('if(await profileHandler(req,res,url))return;'),server.index("url.pathname.startsWith('/api/')"))
 def test_private_profile_stays_out_of_git(self):
  tracked=git('ls-files').decode().split()
  self.assertNotIn('lab-service/developer-profile.json',tracked)
  self.assertIn('/lab-service/developer-profile.json',(ROOT/'.gitignore').read_text())
  self.assertEqual(CONFIG['support_files']['developer-profile.json'],'lab-service/developer-profile.json')
  example=json.loads((ROOT/'docs/developer-profile.example.json').read_text(encoding='utf-8'))
  for profile in [example]+([json.loads(PRIVATE.read_text(encoding='utf-8'))] if PRIVATE.is_file() else []):
   self.assertEqual(profile['schema'],1)
   for key in ['identity','education','projects','skills']:self.assertIsInstance(profile[key],dict)
   for link in profile['identity'].get('links',[]):self.assertTrue(link['url'].startswith('https://'))
 def test_isolated_suites_expect_the_markup_this_release_ships(self):
  pages=[text(p) for folder in ['lab-service/public','calendar-app/public','calendar-app/stocks'] for p in sorted((ROOT/folder).rglob('*.html')) if 'vendor' not in p.parts]
  checked=0
  for name,path in CONFIG['test_inputs'].items():
   if not name.endswith('-http.cjs'):continue
   for literal in re.findall(r"\.includes\('(<[^'+]*>[^'+]*)'\)",text(ROOT/path)):
    with self.subTest(suite=name,literal=literal):self.assertTrue(any(literal in page for page in pages));checked+=1
  self.assertGreaterEqual(checked,1)
  suite=text(HERE/'tests/developer-http.cjs')
  for marker in re.findall(r"'(<a href=\"[^']+</strong>)'",suite):self.assertIn(marker,text(ROOT/'lab-service/public/homepage.html'))
 def test_shared_runtime_and_isolation_inputs(self):
  self.assertEqual(len(CONFIG['isolation_checks']),11);self.assertEqual(CONFIG['isolation_checks'][-1],'developer-http.cjs')
  for path in list(CONFIG['test_inputs'].values())+[v for k,v in CONFIG['support_files'].items() if k!='developer-profile.json']:self.assertTrue((ROOT/path).is_file(),path)
  self.assertEqual(CONFIG['test_inputs']['asset-checks.json'],'scripts/releases/v2.4.1.0/release-config.json')
  self.assertEqual(CONFIG['support_files']['prior_0404.py'],'scripts/releases/v2.4.0.4/deploy.py')
  self.assertIn('from build_overlay import build',(HERE/'build-package.py').read_text())
  self.assertEqual(git('diff','--name-only',BASE,'--','scripts/updater','scripts/releases/v2.4.0.4').decode().strip(),'')
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_deploy_reuses_prior_checks_and_stages_the_private_profile(self):
  import shutil,tempfile
  spec=importlib.util.spec_from_file_location('deploy_0410_under_test',HERE/'deploy.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
  self.assertIs(deploy.runtime.verify_https,deploy.verify);self.assertIs(deploy.runtime.HOOKS['prepare'],deploy.prepare)
  self.assertIs(deploy.runtime.run,deploy.prior.checked_run);self.assertEqual(deploy.runtime.VERSION,'2.4.1.0');self.assertEqual(deploy.runtime.REQUIRES,'2.4.0.4')
  self.assertEqual(deploy.checks.CONFIG['version'],'2.4.1.0');self.assertEqual(deploy.prior.CONFIG['version'],'2.4.1.0')
  with tempfile.TemporaryDirectory() as tmp:
   tmp=Path(tmp);deploy.ROOT=tmp
   with self.assertRaisesRegex(RuntimeError,'missing from the package'):deploy.prepare({},{},{},tmp)
   (tmp/'developer-profile.json').write_text(json.dumps({'schema':1,'identity':{},'education':{},'projects':{}}))
   with self.assertRaisesRegex(RuntimeError,'unexpected structure'):deploy.prepare({},{},{},tmp)
   (tmp/'developer-profile.json').write_text(json.dumps({'schema':1,'identity':{},'education':{},'projects':{},'skills':{}}))
   deploy.runtime.say=lambda s:None;deploy.prepare({},{},{},tmp)
   for variant in ['1.3.4.1','1.3.4.2']:self.assertTrue((tmp/'payload'/variant/'lab-service/developer-profile.json').is_file())
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('New starfield homepage; the developer profile moved to garyhub.uk/developer/.',s)
  for stale in ['Study Q&A consent','Multi-line','A-share','VIP','GLM']:self.assertNotIn(stale,s)
  self.assertIn('-PrepareOnly',s);self.assertIn('preserving all current records',s)
 def test_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.1.0.json').read_text(encoding='utf-8'));self.assertEqual(r['version'],'garyhub-2.4.1.0');self.assertEqual(r['date'],'2026-11-10')
  self.assertEqual([n['scope'] for n in r['notes']],['home','home','tools'])
  self.assertTrue(all(n['title'] and n['body'] for n in r['notes']))
  self.assertIsNone(PERSONAL.search(json.dumps(r,ensure_ascii=False)))
if __name__=='__main__':unittest.main()
