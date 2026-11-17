import difflib,hashlib,importlib.util,json,re,subprocess,unittest
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.1.4'
PRIOR=ROOT/'scripts/releases/v2.4.1.3'
CONFIG=json.loads((HERE/'release-config.json').read_text(encoding='utf-8'))
BASE=CONFIG['reviewed_base_commit']
git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT)
# Read what Git stores (the index): a CRLF checkout of an unchanged text file is not a different release.
stored=lambda path:git('show',':'+Path(path).relative_to(ROOT).as_posix())
text=lambda path:stored(path).decode()
SHARED=['brand.css','hub-nav.js','hub-search.js','hub-search.css','hub-prefs.js','favicon.svg','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png','tools-catalog.js']
TAG='<script src="/hub-prefs.js?v=2.4.1.4"></script>'
def local(a):
 base=ROOT/('calendar-app/public' if a['host']=='calendar.garyhub.uk' else 'lab-service/public')
 if a['host']=='sites.garyhub.uk':base=base/'sites'
 route=a['route']
 rel=('homepage.html' if a['host']=='garyhub.uk' else 'index.html') if route=='/' else route.lstrip('/')+'index.html' if route.endswith('/') else route.lstrip('/')
 return base/('admin.html' if rel=='admin/index.html' else rel)
delta=lambda a,b:[l for l in difflib.unified_diff(a.splitlines(),b.splitlines(),lineterm='',n=0) if l[:1] in '+-' and l[:3] not in ('+++','---')]
pages=lambda:[p for p in git('ls-files','calendar-app/public','calendar-app/stocks','lab-service/public').decode().split() if p.endswith('.html') and '/vendor/' not in p]
class ReleaseTests(unittest.TestCase):
 def test_manifest_and_strict_baseline(self):
  m=json.loads((ROOT/'releases/2.4.1.4.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['version'],'2.4.1.4');self.assertEqual(CONFIG['requires_release'],'2.4.1.3');self.assertEqual(m['requires_release'],'2.4.1.3')
  self.assertEqual(CONFIG['baseline_adapter'],'scripts/releases/v2.4.1.3')
  self.assertEqual(BASE,m['reviewed_base_commit']);self.assertEqual(BASE,'5306dd9b56d753b4b7fd99a92400196b392fe6f8');self.assertFalse(m['production_verified'])
  self.assertIn("BASE='"+BASE+"'",(HERE/'build-package.py').read_text())
  # The reviewed base is the merged v2.4.1.3 (PR #46); its tree is the v2.4.1.3 release commit.
  self.assertEqual(git('rev-parse',BASE+'^{tree}'),git('rev-parse','c669e6b^{tree}'))
  self.assertEqual(CONFIG['installer_build'],'v2.4.1.4-r1');self.assertEqual(m['installer_revision'],'r1')
  for protection in ['preferences_account_scoped_and_validated','preferences_merge_atomic','preferences_table_without_user_foreign_key']:self.assertIn(protection,m['protections'])
  self.assertEqual(json.loads((ROOT/'releases/current.json').read_text())['manifest'],'releases/2.4.1.4.json')
 def test_runtime_and_asset_hashes(self):
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums']:
   for a in CONFIG[group]:
    with self.subTest(host=a['host'],route=a['route']):self.assertEqual(hashlib.sha256(stored(local(a))).hexdigest(),a['sha256'])
  for name,expected in CONFIG['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256(stored(ROOT/'calendar-app/stocks'/name)).hexdigest(),expected)
  public={(a['host'],a['route']) for a in CONFIG['asset_checksums']}
  for host in ['tools.garyhub.uk','garyhub.uk','calendar.garyhub.uk']:self.assertIn((host,'/hub-prefs.js'),public)
  self.assertIn(('tools.garyhub.uk','/personalize/index.html'),{(a['host'],a['route']) for a in CONFIG['protected_asset_checksums']})
 def test_shipped_files_keep_stored_line_endings(self):
  changed=[p for p in git('diff','--name-only',BASE,'--','calendar-app','lab-service').decode().split() if (ROOT/p).is_file()]
  self.assertIn('calendar-app/preferences-api.js',changed)
  for path in changed+['scripts/releases/v2.4.1.4/variant-overrides/1.3.4.1/'+rel for rel in ['calendar-app/app.js','lab-service/server.cjs']]:
   with self.subTest(path=path):self.assertEqual((ROOT/path).read_bytes(),stored(ROOT/path))
 def test_capability_variant_matches_the_main_server_changes(self):
  for rel in ['calendar-app/app.js','lab-service/server.cjs']:
   main_before=git('show',BASE+':'+rel).decode();main_after=text(ROOT/rel)
   variant_before=git('show',BASE+':scripts/releases/v2.4.1.3/variant-overrides/1.3.4.1/'+rel).decode();variant_after=text(HERE/'variant-overrides/1.3.4.1'/rel)
   self.assertEqual(delta(main_before,main_after),delta(variant_before,variant_after),rel)
  # app.js changes only its version; the preferences are wired through extras.js.
  self.assertEqual([l[0]+l[1:].strip() for l in delta(git('show',BASE+':calendar-app/app.js').decode(),text(ROOT/'calendar-app/app.js'))],['-res.json({ ok: true, hubVersion: "2.4.1.3" });','+res.json({ ok: true, hubVersion: "2.4.1.4" });'])
  server=text(ROOT/'lab-service/server.cjs')
  self.assertIn('const hubRoute=/^\\/api\\/hub\\/(?:me|preferences|notifications',server);self.assertIn("'/hub-prefs.js'",server)
 def test_shared_copies_and_one_asset_version(self):
  for name in SHARED:
   with self.subTest(name=name):self.assertEqual(stored(ROOT/'calendar-app/public'/name),stored(ROOT/'lab-service/public'/name))
  for name in ['knowledge.js','panel.js','panel.css','pet.js','boot.js']:
   self.assertEqual(stored(ROOT/'calendar-app/public/companion'/name),stored(ROOT/'lab-service/public/companion'/name))
  self.assertIn("document.dispatchEvent(new CustomEvent('garyhub:companion-prefs'",text(ROOT/'lab-service/public/companion/boot.js'))
  leftovers=[l for l in git('grep','-n','-F','2.4.1.3','--','calendar-app','lab-service').decode().splitlines() if not l.startswith('calendar-app/releases/')]
  # Only comments that record when a feature arrived may still name v2.4.1.3.
  for line in leftovers:self.assertRegex(line,r'v2\.4\.1\.3[ :).,]',line)
  for line in leftovers:self.assertNotRegex(line,r'\?v=2\.4\.1\.3|hubVersion|"version"',line)
 def test_every_page_loads_preferences_early(self):
  for page in pages():
   body=text(ROOT/page)
   with self.subTest(page=page):
    if page in ('lab-service/public/sites/index.html','lab-service/public/login.html'):self.assertNotIn('hub-prefs.js',body);continue
    self.assertIn(TAG,body)
    # Pages without an explicit </head> get it right after the viewport meta.
    if '</head>' in body:self.assertLess(body.index(TAG),body.index('</head>'))
    else:self.assertIn('initial-scale=1">'+TAG,body)
    if '<script src="/theme.js"></script>' in body:self.assertLess(body.index(TAG),body.index('<script src="/theme.js"></script>'))
 def test_theme_switches_use_the_shared_setting(self):
  for rel,marker in [('calendar-app/public/theme.js','window.GaryHubTheme?.resolved()'),('calendar-app/public/ambient.js','shared.toggle()'),('calendar-app/public/research/research.js','GaryHubTheme.toggle()'),
                     ('lab-service/public/hub.js','GaryHubTheme.toggle()'),('calendar-app/stocks/app.js','GaryHubTheme.toggle()'),('lab-service/public/useful/tool-shell.js','GaryHubTheme.toggle()'),
                     ('lab-service/public/home/cosmos.js',"sky()==='still'")]:
   with self.subTest(file=rel):self.assertIn(marker,text(ROOT/rel))
  prefs=text(ROOT/'lab-service/public/hub-prefs.js')
  # The legacy per-site keys are read once (marked in the shared cookie) and never written back.
  self.assertIn("local.get('m') !== '1'",prefs);self.assertNotIn("store.set('garyhub-theme'",prefs)
 def test_preferences_schema_and_table(self):
  api=text(ROOT/'calendar-app/preferences-api.js')
  self.assertIn('CREATE TABLE IF NOT EXISTS user_preferences(',api);self.assertNotIn('REFERENCES',api)
  self.assertIn("json_patch(user_preferences.prefs,?2)",api)
  self.assertIn("'user_preferences'",re.search(r"const owned=\[([^\]]*)\]",text(ROOT/'calendar-app/account-admin.js')).group(1))
  ids=re.findall(r"^\s*([a-z]+):\{available",text(ROOT/'lab-service/public/companion/characters.js'),re.M)
  self.assertEqual(re.search(r"'companion\.char': \[([^\]]*)\]",api).group(1).replace("'",'').split(', '),ids)
 def test_isolation_inputs(self):
  previous=json.loads((PRIOR/'release-config.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['isolation_checks'],previous['isolation_checks']+['prefs-http.cjs'])
  self.assertEqual(CONFIG['test_inputs']['study-http.cjs'],'scripts/releases/v2.4.1.4/tests/study-http.cjs')
  # The updated study suite differs from v2.4.0.1's only in the preference keys it expects.
  old=git('show','HEAD:scripts/releases/v2.4.0.1/tests/study-http.cjs').decode();new=text(HERE/'tests/study-http.cjs')
  self.assertEqual([l[0]+l[1:].strip() for l in delta(old,new) if '// v2.4.1.4' not in l],["-eq(Object.keys(prefs).sort(),['accountId','fontSize','headingSize','revision','studyTheme']);eq(prefs.studyTheme,'warm');","+eq(Object.keys(prefs).sort(),['accountId','fontSize','headingSize','lineHeight','readerWidth','revision','studyTheme']);eq(prefs.studyTheme,'warm');"])
  for path in list(CONFIG['test_inputs'].values())+list(CONFIG['support_files'].values()):self.assertTrue((ROOT/path).is_file(),path)
  self.assertEqual(CONFIG['support_files']['prior_0413.py'],'scripts/releases/v2.4.1.3/deploy.py')
  self.assertEqual(git('diff','--name-only',BASE,'--','scripts/updater','scripts/releases/v2.3.2.3','scripts/releases/v2.4.0.4','scripts/releases/v2.4.1.0','scripts/releases/v2.4.1.1','scripts/releases/v2.4.1.2','scripts/releases/v2.4.1.3').decode().strip(),'')
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_deploy_reuses_prior_checks(self):
  spec=importlib.util.spec_from_file_location('deploy_0414_under_test',HERE/'deploy.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
  self.assertIs(deploy.runtime.verify_https,deploy.verify);self.assertEqual(deploy.runtime.VERSION,'2.4.1.4');self.assertEqual(deploy.runtime.REQUIRES,'2.4.1.3')
  self.assertIs(deploy.checks.shared,deploy.prior.shared_without_useful_login_gate)
  module=deploy.prior
  while module is not None:self.assertEqual(module.CONFIG['version'],'2.4.1.4');module=getattr(module,'prior',None)
  calls=[];same=text(ROOT/'lab-service/public/hub-prefs.js').encode()
  class Done:returncode=0
  deploy.prior.verify=lambda:calls.append('older')
  deploy.runtime.run=lambda args,check=True:(calls.append(args[2]),Done())[1]
  pages={'garyhub.uk/':text(ROOT/'lab-service/public/homepage.html'),'tools.garyhub.uk/':text(ROOT/'lab-service/public/index.html'),'calendar.garyhub.uk/login/':text(ROOT/'calendar-app/public/login/index.html')}
  deploy.runtime.https=lambda host,route:same if route.startswith('/hub-prefs.js') else pages[host+route].encode()
  deploy.checks.status=lambda host,route,method='GET':b'403' if method=='PUT' else b'302' if route=='/personalize/' else b'401'
  deploy.verify()
  self.assertEqual(calls[0],'older');self.assertEqual(calls.count('calendar-app'),2);self.assertEqual(calls.count('garyhub-lab'),1)
  deploy.runtime.https=lambda host,route:(same+(b'x' if host=='garyhub.uk' else b'')) if route.startswith('/hub-prefs.js') else pages[host+route].encode()
  with self.assertRaisesRegex(RuntimeError,'differs between hosts'):deploy.verify()
  deploy.runtime.https=lambda host,route:same if route.startswith('/hub-prefs.js') else pages[host+route].encode()
  deploy.checks.status=lambda host,route,method='GET':b'200'
  with self.assertRaisesRegex(RuntimeError,'Missing authentication gate'):deploy.verify()
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('The settings centre is live',s)
  for stale in ['today panel','Code blocks','starfield','GLM']:self.assertNotIn(stale,s)
  prior=(PRIOR/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig').replace('\r\n','\n')
  self.assertEqual(len(delta(prior,s.replace('\r\n','\n'))),2)
 def test_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.1.4.json').read_text(encoding='utf-8'));self.assertEqual(r['version'],'garyhub-2.4.1.4');self.assertEqual(r['date'],'2026-11-17')
  self.assertEqual([n['scope'] for n in r['notes']],['home','tools'])
  self.assertTrue(all(n['title'] and n['body'] for n in r['notes']))
if __name__=='__main__':unittest.main()
