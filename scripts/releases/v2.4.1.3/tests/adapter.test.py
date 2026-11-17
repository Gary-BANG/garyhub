import difflib,hashlib,importlib.util,json,re,subprocess,unittest
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.1.3'
PRIOR=ROOT/'scripts/releases/v2.4.1.2'
CONFIG=json.loads((HERE/'release-config.json').read_text(encoding='utf-8'))
BASE=CONFIG['reviewed_base_commit']
git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT)
# Read what Git stores (the index): a CRLF checkout of an unchanged text file is not a different release.
stored=lambda path:git('show',':'+Path(path).relative_to(ROOT).as_posix())
text=lambda path:stored(path).decode()
SHARED=['brand.css','hub-nav.js','hub-search.js','hub-search.css','favicon.svg','icons/icon-192.png','icons/icon-512.png','icons/icon-maskable-512.png','icons/apple-touch-icon.png']
NEW_TABLES=['calendar_feeds','push_subscriptions','push_reminder_log','stock_alerts','ledger_budgets']
def local(a):
 base=ROOT/('calendar-app/public' if a['host']=='calendar.garyhub.uk' else 'lab-service/public')
 if a['host']=='sites.garyhub.uk':base=base/'sites'
 route=a['route']
 rel=('homepage.html' if a['host']=='garyhub.uk' else 'index.html') if route=='/' else route.lstrip('/')+'index.html' if route.endswith('/') else route.lstrip('/')
 return base/('admin.html' if rel=='admin/index.html' else rel)
delta=lambda a,b:[l for l in difflib.unified_diff(a.splitlines(),b.splitlines(),lineterm='',n=0) if l[:1] in '+-' and l[:3] not in ('+++','---')]
class ReleaseTests(unittest.TestCase):
 def test_manifest_and_strict_baseline(self):
  m=json.loads((ROOT/'releases/2.4.1.3.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['version'],'2.4.1.3');self.assertEqual(CONFIG['requires_release'],'2.4.1.2');self.assertEqual(m['requires_release'],'2.4.1.2')
  self.assertEqual(CONFIG['baseline_adapter'],'scripts/releases/v2.4.1.2')
  self.assertEqual(BASE,m['reviewed_base_commit']);self.assertEqual(BASE,'2d1977503a74d921e7c4f6005e181c46da14ca6f');self.assertFalse(m['production_verified'])
  self.assertIn("BASE='"+BASE+"'",(HERE/'build-package.py').read_text())
  # The reviewed base is the merged v2.4.1.2 (PR #45); its tree is the v2.4.1.2 release commit.
  self.assertEqual(git('rev-parse',BASE+'^{tree}'),git('rev-parse','aad2f81^{tree}'))
  self.assertEqual(CONFIG['installer_build'],'v2.4.1.3-r1');self.assertEqual(m['installer_revision'],'r1');self.assertNotIn('installed_baseline_tree',CONFIG)
  for protection in ['guest_tools_local_only','search_and_today_account_scoped','calendar_feed_secret_hashed_and_rotatable','push_endpoints_restricted_and_encrypted','stock_alerts_subscriber_gate','new_tables_without_user_foreign_keys']:
   self.assertIn(protection,m['protections'])
  self.assertEqual(json.loads((ROOT/'releases/current.json').read_text())['manifest'],'releases/2.4.1.3.json')
 def test_runtime_and_asset_hashes(self):
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums']:
   for a in CONFIG[group]:
    with self.subTest(host=a['host'],route=a['route']):self.assertEqual(hashlib.sha256(stored(local(a))).hexdigest(),a['sha256'])
  for name,expected in CONFIG['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256(stored(ROOT/'calendar-app/stocks'/name)).hexdigest(),expected)
  self.assertIn('alerts.js',CONFIG['stock_asset_sha256'])
  # The three local tools are public now; their pages are hashed as public responses, not behind the login gate.
  public={(a['host'],a['route']) for a in CONFIG['asset_checksums']}
  for tool in ['image-eraser','markdown-viewer','pdf-gray']:
   self.assertIn(('tools.garyhub.uk','/useful/'+tool+'/index.html'),public)
   self.assertFalse(any(a['route'].startswith('/useful/') for a in CONFIG['protected_asset_checksums']))
  for host in ['tools.garyhub.uk','garyhub.uk','calendar.garyhub.uk']:
   for route in ['/brand.css','/hub-search.js','/manifest.webmanifest','/favicon.svg']:self.assertIn((host,route),public)
 def test_shipped_files_keep_stored_line_endings(self):
  changed=[p for p in git('diff','--name-only',BASE,'--','calendar-app','lab-service').decode().split() if (ROOT/p).is_file()]
  self.assertIn('calendar-app/extras.js',changed)
  for path in changed+['scripts/releases/v2.4.1.3/variant-overrides/1.3.4.1/'+rel for rel in ['calendar-app/app.js','lab-service/server.cjs']]:
   with self.subTest(path=path):self.assertEqual((ROOT/path).read_bytes(),stored(ROOT/path))
 def test_capability_variant_matches_the_main_server_changes(self):
  for rel in ['calendar-app/app.js','lab-service/server.cjs']:
   main_before=git('show',BASE+':'+rel).decode();main_after=text(ROOT/rel)
   variant_before=git('show',BASE+':scripts/releases/v2.4.1.2/variant-overrides/1.3.4.1/'+rel).decode();variant_after=text(HERE/'variant-overrides/1.3.4.1'/rel)
   self.assertNotEqual(main_before,main_after)
   self.assertEqual(delta(main_before,main_after),delta(variant_before,variant_after),rel)
  self.assertIn('hubVersion:"2.4.1.3"',text(ROOT/'lab-service/server.cjs'));self.assertIn('hubVersion: "2.4.1.3"',text(ROOT/'calendar-app/app.js'))
  # app.js only gains the three wiring lines (and the version); the features live in their own modules.
  app=delta(git('show',BASE+':calendar-app/app.js').decode(),text(ROOT/'calendar-app/app.js'))
  self.assertEqual(sorted(l for l in app if l[0]=='+' and 'hubVersion' not in l),sorted(['+const { migrateExtras, registerExtras } = require("./extras");','+registerExtras(app, { db:require("./db"), requireLogin });','+  .then(() => migrateExtras(require("./db")))']))
 def test_shared_header_copies_and_one_asset_version(self):
  for name in SHARED+['tools-catalog.js']:
   with self.subTest(name=name):self.assertEqual(stored(ROOT/'calendar-app/public'/name),stored(ROOT/'lab-service/public'/name))
  for name in ['knowledge.js','panel.js','panel.css','pet.js','boot.js']:
   self.assertEqual(stored(ROOT/'calendar-app/public/companion'/name),stored(ROOT/'lab-service/public/companion'/name))
  leftovers=[p for p in git('grep','-l','-F','2.4.1.2','--','calendar-app','lab-service').decode().split() if not p.startswith('calendar-app/releases/')]
  self.assertEqual(leftovers,[])
  pages=[p for p in git('ls-files','calendar-app/public','calendar-app/stocks','lab-service/public').decode().split() if p.endswith('.html') and '/vendor/' not in p]
  for page in pages:
   with self.subTest(page=page):self.assertIn('rel="icon" href="/favicon.svg"',text(ROOT/page))
  # Every header that shows the GaryHub logo uses the shared one, and the pages that fold into the phone menu load hub-nav.js.
  for page in pages:
   body=text(ROOT/page)
   self.assertNotRegex(body,r'<a class="brand" href="[^"]*">Gary<(span|i)>Hub\.',page)
   if 'data-gh-header' in body:self.assertIn('/hub-nav.js?v=2.4.1.3',body,page);self.assertIn('data-gh-menu',body,page)
  home=text(ROOT/'lab-service/public/homepage.html')
  self.assertIn('<script src="/companion/boot.js?v=2.4.1.3" defer data-companion="open"></script>',home)
  self.assertIn('<a href="https://sites.garyhub.uk/" target="_blank" rel="noopener"><strong>Elsewhere ↗</strong>',home)
  self.assertIn('<a href="/developer/"><strong>Developer Profile</strong>',home)
 def test_new_tables_are_owned_and_never_reference_users(self):
  owned=re.search(r"const owned=\[([^\]]*)\]",text(ROOT/'calendar-app/account-admin.js')).group(1)
  for table in NEW_TABLES:self.assertIn("'"+table+"'",owned)
  sources=''.join(text(ROOT/'calendar-app'/f) for f in ['calendar-feed.js','push-api.js','stock-alerts.js','ledger-budget.js'])
  for create in re.findall(r'CREATE TABLE IF NOT EXISTS (\w+)\(([^`]*?)\)`',sources,re.S):
   with self.subTest(table=create[0]):self.assertNotIn('REFERENCES',create[1])
  self.assertEqual(sorted(re.findall(r'CREATE TABLE IF NOT EXISTS (\w+)',sources)),sorted(NEW_TABLES+['push_keys']))
 def test_guest_tools_and_homepage_whitelist(self):
  server=text(ROOT/'lab-service/server.cjs')
  self.assertNotIn("if(!await identity(req))return redirectLogin(url.pathname+url.search);\n      if(!url.pathname.endsWith('/')&&!url.pathname.endsWith('.html'))",server)
  self.assertIn("connect-src 'self'; media-src 'self' https://*.r2.cloudflarestorage.com; object-src 'none'; base-uri 'none'",server)
  for route in ['/home/today.js','/developer/public-card.json','/brand.css','/hub-search.js','/manifest.webmanifest','/favicon.svg','/icons/icon-512.png']:self.assertIn("'"+route+"'",server)
  whitelist=next(line for line in server.splitlines() if line.lstrip().startswith('if(isHome&&!/^\\/companion'))
  for route in ["'/tools-dock.js'","'/hub.js'","'/admin.js'"]:self.assertNotIn(route,whitelist)
  card=json.loads(text(ROOT/'lab-service/public/developer/public-card.json'))
  self.assertTrue(all(link['url'].startswith('https://') for link in card['links']))
  self.assertNotRegex(json.dumps(card,ensure_ascii=False),r'ZJUI|Zhejiang|Urbana|2028|Multi-UAV|Intelligent Assistants')
 def test_isolated_suites_expect_the_markup_this_release_ships(self):
  pages=[text(p) for folder in ['lab-service/public','calendar-app/public','calendar-app/stocks'] for p in sorted((ROOT/folder).rglob('*.html')) if 'vendor' not in p.parts and git('ls-files',str(p.relative_to(ROOT))).strip()]
  checked=0
  for name,path in CONFIG['test_inputs'].items():
   if not name.endswith('-http.cjs'):continue
   for literal in re.findall(r"\.includes\('(<[^'+]*>[^'+]*)'\)",text(ROOT/path)):
    with self.subTest(suite=name,literal=literal):self.assertTrue(any(literal in page for page in pages));checked+=1
  self.assertGreaterEqual(checked,1)
  # The two suites of this release check markers through arrays; make sure each of those is on its page too.
  home=text(ROOT/'lab-service/public/homepage.html');tools=text(ROOT/'lab-service/public/index.html')
  for marker in ['data-gh-header','data-gh-menu','id="today"','/home/today.js?v=2.4.1.3','/hub-search.js?v=2.4.1.3','rel="manifest"','class="brand gh-brand"']:self.assertIn(marker,home)
  for marker in ['data-gh-header','data-gh-menu data-gh-search-host','class="brand gh-brand"','/hub-nav.js?v=2.4.1.3']+['<li data-tool="'+t+'" data-guest>' for t in ['eraser','markdown','pdf']]:self.assertIn(marker,tools)
 def test_shared_runtime_and_isolation_inputs(self):
  previous=json.loads((PRIOR/'release-config.json').read_text(encoding='utf-8'))['isolation_checks']
  self.assertEqual(CONFIG['isolation_checks'],previous+['extras-http.cjs'])
  self.assertEqual(CONFIG['test_inputs']['useful-http.cjs'],'scripts/releases/v2.4.1.3/tests/useful-http.cjs')
  for path in list(CONFIG['test_inputs'].values())+list(CONFIG['support_files'].values()):self.assertTrue((ROOT/path).is_file(),path)
  self.assertEqual(CONFIG['test_inputs']['asset-checks.json'],'scripts/releases/v2.4.1.3/release-config.json')
  self.assertEqual(CONFIG['support_files']['prior_0412.py'],'scripts/releases/v2.4.1.2/deploy.py')
  self.assertEqual(CONFIG['isolation_service_environment']['calendar-app']['GARYHUB_PUSH_TEST_ENDPOINT'],'http://127.0.0.1:4012/push/')
  self.assertIn('from build_overlay import build',(HERE/'build-package.py').read_text())
  self.assertEqual(git('diff','--name-only',BASE,'--','scripts/updater','scripts/releases/v2.3.2.3','scripts/releases/v2.4.0.4','scripts/releases/v2.4.1.0','scripts/releases/v2.4.1.1','scripts/releases/v2.4.1.2').decode().strip(),'')
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_deploy_reuses_prior_checks_and_opens_the_local_tools(self):
  spec=importlib.util.spec_from_file_location('deploy_0413_under_test',HERE/'deploy.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
  self.assertIs(deploy.runtime.verify_https,deploy.verify);self.assertNotIn('prepare',deploy.runtime.HOOKS)
  self.assertIs(deploy.checks.shared,deploy.shared_without_useful_login_gate)
  self.assertEqual(deploy.runtime.VERSION,'2.4.1.3');self.assertEqual(deploy.runtime.REQUIRES,'2.4.1.2')
  for module in [deploy.checks,deploy.prior,deploy.prior.prior,deploy.prior.prior.prior,deploy.prior.prior.prior.prior]:self.assertEqual(module.CONFIG['version'],'2.4.1.3')
  calls=[];home=text(ROOT/'lab-service/public/homepage.html')
  class Done:returncode=0
  deploy.prior.verify=lambda:calls.append('older')
  deploy.runtime.run=lambda args,check=True:(calls.append(args[2]),Done())[1]
  pages={'garyhub.uk/':home,'tools.garyhub.uk/':text(ROOT/'lab-service/public/index.html'),'calendar.garyhub.uk/login/':text(ROOT/'calendar-app/public/login/index.html')}
  deploy.runtime.https=lambda host,route:pages[host+route].encode()
  statuses={}
  def status(host,route,method='GET'):
   calls.append(method+' '+host+route)
   return b'403' if method=='POST' else b'404' if route.startswith('/feed/') else b'401'
  deploy.checks.status=status
  deploy.checks.curl_headers=lambda host,route:'HTTP/1.1 200 OK\r\ncontent-type: application/manifest+json\r\n'
  deploy.verify()
  self.assertEqual(calls[0],'older');self.assertIn('GET garyhub.uk/api/hub/today',calls);self.assertIn('POST calendar.garyhub.uk/api/push/subscribe',calls)
  self.assertEqual(calls.count('calendar-app'),2);self.assertEqual(calls.count('garyhub-lab'),1)
  pages['garyhub.uk/']=git('show',BASE+':lab-service/public/homepage.html').decode()
  with self.assertRaisesRegex(RuntimeError,'Homepage marker missing'):deploy.verify()
  pages['garyhub.uk/']=home
  deploy.checks.status=lambda host,route,method='GET':b'200'
  with self.assertRaisesRegex(RuntimeError,'Missing authentication gate'):deploy.verify()
  # The replaced shared check: guests must get the tool page with its CSP, not a login redirect.
  deploy.runtime.https=lambda host,route:(pages['tools.garyhub.uk/'] if route=='/' else '{"version":"2.4.1.3"}' if route.endswith('.json') else 'x').encode()
  deploy.checks.status=lambda host,route,method='GET':b'401' if host=='calendar.garyhub.uk' else b'404'
  deploy.checks.curl_headers=lambda host,route:"HTTP/1.1 200 OK\r\ncontent-security-policy: default-src 'self'; connect-src 'self'\r\n"
  deploy.shared_without_useful_login_gate()
  deploy.checks.curl_headers=lambda host,route:'HTTP/1.1 302 Found\r\nlocation: https://calendar.garyhub.uk/login/?next=x\r\n'
  with self.assertRaisesRegex(RuntimeError,'not open to guests'):deploy.shared_without_useful_login_gate()
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('Shared header and icons, today panel, search, calendar subscription, push, budgets and price alerts are live.',s)
  for stale in ['Code blocks','Formulas','starfield','GLM']:self.assertNotIn(stale,s)
  prior=(PRIOR/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig').replace('\r\n','\n')
  self.assertEqual(len(delta(prior,s.replace('\r\n','\n'))),2)  # only the COMPLETE line differs
 def test_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.1.3.json').read_text(encoding='utf-8'));self.assertEqual(r['version'],'garyhub-2.4.1.3');self.assertEqual(r['date'],'2026-11-17')
  self.assertEqual([n['scope'] for n in r['notes']],['home','calendar','tools'])
  self.assertTrue(all(n['title'] and n['body'] for n in r['notes']))
if __name__=='__main__':unittest.main()
