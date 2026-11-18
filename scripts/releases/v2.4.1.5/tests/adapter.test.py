import difflib,hashlib,importlib.util,json,re,subprocess,unittest
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.1.5'
PRIOR=ROOT/'scripts/releases/v2.4.1.4'
CONFIG=json.loads((HERE/'release-config.json').read_text(encoding='utf-8'))
BASE=CONFIG['reviewed_base_commit']
git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT)
# Read what Git stores (the index): a CRLF checkout of an unchanged text file is not a different release.
stored=lambda path:git('show',':'+Path(path).relative_to(ROOT).as_posix())
text=lambda path:stored(path).decode()
SHARED=['brand.css','hub-nav.js','hub-search.js','hub-search.css','hub-prefs.js','favicon.svg','icons/icon-192.png','tools-catalog.js']
NEW_KEYS={'appearance.accent':['blue','violet','teal','brown'],'appearance.density':['standard','compact'],'region.weekStart':['monday','sunday'],
          'region.dateFormat':['iso','zh','us','eu'],'calendar.view':['month','week','list']}
def local(a):
 base=ROOT/('calendar-app/public' if a['host']=='calendar.garyhub.uk' else 'lab-service/public')
 if a['host']=='sites.garyhub.uk':base=base/'sites'
 route=a['route']
 rel=('homepage.html' if a['host']=='garyhub.uk' else 'index.html') if route=='/' else route.lstrip('/')+'index.html' if route.endswith('/') else route.lstrip('/')
 return base/('admin.html' if rel=='admin/index.html' else rel)
delta=lambda a,b:[l for l in difflib.unified_diff(a.splitlines(),b.splitlines(),lineterm='',n=0) if l[:1] in '+-' and l[:3] not in ('+++','---')]
strip=lambda lines:[l[0]+l[1:].strip() for l in lines]
class ReleaseTests(unittest.TestCase):
 def test_manifest_and_strict_baseline(self):
  m=json.loads((ROOT/'releases/2.4.1.5.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['version'],'2.4.1.5');self.assertEqual(CONFIG['requires_release'],'2.4.1.4');self.assertEqual(m['requires_release'],'2.4.1.4')
  self.assertEqual(CONFIG['baseline_adapter'],'scripts/releases/v2.4.1.4')
  self.assertEqual(BASE,m['reviewed_base_commit']);self.assertEqual(BASE,'0041a4ef2752fa5473bc6775452c864b3f68f17a');self.assertFalse(m['production_verified'])
  self.assertIn("BASE='"+BASE+"'",(HERE/'build-package.py').read_text())
  # The reviewed base is the merged v2.4.1.4 (PR #47); its tree is the v2.4.1.4 release commit.
  self.assertEqual(git('rev-parse',BASE+'^{tree}'),git('rev-parse','ef85c1d^{tree}'))
  self.assertEqual(CONFIG['installer_build'],'v2.4.1.5-r1');self.assertEqual(m['installer_revision'],'r1')
  self.assertIn('display_preferences_fixed_values',m['protections'])
  self.assertEqual(json.loads((ROOT/'releases/current.json').read_text())['manifest'],'releases/2.4.1.5.json')
 def test_runtime_and_asset_hashes(self):
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums']:
   for a in CONFIG[group]:
    with self.subTest(host=a['host'],route=a['route']):self.assertEqual(hashlib.sha256(stored(local(a))).hexdigest(),a['sha256'])
  for name,expected in CONFIG['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256(stored(ROOT/'calendar-app/stocks'/name)).hexdigest(),expected)
  public={(a['host'],a['route']) for a in CONFIG['asset_checksums']}
  for route in ['/calendar-page.js','/unified.js','/journal-page.js']:self.assertIn(('calendar.garyhub.uk',route),public)
  for route in ['/academic/style.css','/academic/app.js']:self.assertIn(('tools.garyhub.uk',route),public)
 def test_shipped_files_keep_stored_line_endings(self):
  changed=[p for p in git('diff','--name-only',BASE,'--','calendar-app','lab-service').decode().split() if (ROOT/p).is_file()]
  self.assertIn('calendar-app/preferences-api.js',changed)
  for path in changed+['scripts/releases/v2.4.1.5/variant-overrides/1.3.4.1/'+rel for rel in ['calendar-app/app.js','lab-service/server.cjs']]:
   with self.subTest(path=path):self.assertEqual((ROOT/path).read_bytes(),stored(ROOT/path))
 def test_capability_variant_changes_only_the_version(self):
  for rel,old,new in [('calendar-app/app.js','res.json({ ok: true, hubVersion: "2.4.1.4" });','res.json({ ok: true, hubVersion: "2.4.1.5" });'),
                      ('lab-service/server.cjs','hubVersion:"2.4.1.4"','hubVersion:"2.4.1.5"')]:
   main=strip(delta(git('show',BASE+':'+rel).decode(),text(ROOT/rel)))
   variant=strip(delta(git('show',BASE+':scripts/releases/v2.4.1.4/variant-overrides/1.3.4.1/'+rel).decode(),text(HERE/'variant-overrides/1.3.4.1'/rel)))
   self.assertEqual(main,variant,rel);self.assertEqual(len(main),2,rel);self.assertIn(old,main[0]);self.assertIn(new,main[1])
 def test_shared_copies_and_one_asset_version(self):
  for name in SHARED:
   with self.subTest(name=name):self.assertEqual(stored(ROOT/'calendar-app/public'/name),stored(ROOT/'lab-service/public'/name))
  for name in ['knowledge.js','panel.js','panel.css','pet.js','boot.js']:
   self.assertEqual(stored(ROOT/'calendar-app/public/companion'/name),stored(ROOT/'lab-service/public/companion'/name))
  # Only comments that record when a feature arrived may still name v2.4.1.4.
  for line in [l for l in git('grep','-n','-F','2.4.1.4','--','calendar-app','lab-service').decode().splitlines() if not l.startswith('calendar-app/releases/')]:
   self.assertRegex(line,r'v2\.4\.1\.4[ :).,]',line);self.assertNotRegex(line,r'\?v=2\.4\.1\.4|hubVersion|"version"',line)
 def test_new_preference_keys(self):
  api=text(ROOT/'calendar-app/preferences-api.js')
  for key,values in NEW_KEYS.items():
   with self.subTest(key=key):self.assertIn("'"+key+"': ["+', '.join("'"+v+"'" for v in values)+"]",api)
  prefs=text(ROOT/'lab-service/public/hub-prefs.js')
  for key in NEW_KEYS:self.assertIn("'"+key+"': {param:",prefs)
  # Display settings come only from the account (no upload from a shared browser), and the Study Hub opts out of the accent.
  self.assertIn("for (const key of Object.keys(DISPLAY)) if (localValue(key) !== (prefs[key] ?? null))",prefs)
  self.assertIn('data-gh-accent-off',prefs);self.assertIn('<html lang="zh-CN" data-gh-accent-off>',text(ROOT/'lab-service/public/academic/index.html'))
  brand=text(ROOT/'lab-service/public/brand.css')
  for accent in NEW_KEYS['appearance.accent']:self.assertIn('html[data-gh-accent='+accent+'][data-gh-theme=dark]',brand)
  self.assertIn('html[data-gh-density=compact]{--gh-header:52px}',brand)
 def test_pages_apply_the_settings(self):
  for rel,marker in [('calendar-app/public/calendar-page.js',"firstDay:prefs?.value('region.weekStart')==='sunday'?0:1"),('calendar-app/public/calendar-page.js',"initialView:views[prefs?.value('calendar.view')]||'dayGridMonth'"),
                     ('calendar-app/public/calendar-page.js',"center:'dayGridMonth,dayGridWeek,listMonth'"),('calendar-app/public/journal-page.js',"value('region.weekStart')==='sunday'"),
                     ('calendar-app/public/unified.js','ghDate(task.start_date)'),('calendar-app/public/ledger/ledger.js','formatDate(e.date)'),('lab-service/public/home/today.js','t.until(fmt(task.endDate))'),
                     ('lab-service/public/hub-search.js','formatDate(date)'),('lab-service/public/academic/style.css','font-family:var(--reader-code-font,'),
                     ('lab-service/public/academic/style.css','calc(1.13em * var(--reader-math-scale,1))'),('lab-service/public/academic/app.js',"setProperty('--reader-math-scale'")]:
   with self.subTest(file=rel,marker=marker):self.assertIn(marker,text(ROOT/rel))
  core=text(ROOT/'lab-service/public/academic/core.js');self.assertIn("['default','consolas','courier','sans'].includes(s.settings.codeFont)",core);self.assertIn('range(s.settings.mathScale,0.8,1.5)',core)
 def test_isolation_inputs(self):
  previous=json.loads((PRIOR/'release-config.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['isolation_checks'],previous['isolation_checks'])
  for name in ['prefs-http.cjs','study-http.cjs']:self.assertEqual(CONFIG['test_inputs'][name],'scripts/releases/v2.4.1.5/tests/'+name)
  old=git('show','HEAD:scripts/releases/v2.4.1.4/tests/study-http.cjs').decode();new=text(HERE/'tests/study-http.cjs')
  self.assertEqual([l for l in strip(delta(old,new)) if 'v2.4.1.5' not in l and 'v2.4.1.4' not in l],["-eq(Object.keys(prefs).sort(),['accountId','fontSize','headingSize','lineHeight','readerWidth','revision','studyTheme']);eq(prefs.studyTheme,'warm');","+eq(Object.keys(prefs).sort(),['accountId','codeFont','fontSize','headingSize','lineHeight','mathScale','readerWidth','revision','studyTheme']);eq(prefs.studyTheme,'warm');"])
  for path in list(CONFIG['test_inputs'].values())+list(CONFIG['support_files'].values()):self.assertTrue((ROOT/path).is_file(),path)
  self.assertEqual(CONFIG['support_files']['prior_0414.py'],'scripts/releases/v2.4.1.4/deploy.py')
  self.assertEqual(git('diff','--name-only',BASE,'--','scripts/updater','scripts/releases/v2.3.2.3','scripts/releases/v2.4.0.4','scripts/releases/v2.4.1.0','scripts/releases/v2.4.1.1','scripts/releases/v2.4.1.2','scripts/releases/v2.4.1.3','scripts/releases/v2.4.1.4').decode().strip(),'')
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_deploy_reuses_prior_checks(self):
  spec=importlib.util.spec_from_file_location('deploy_0415_under_test',HERE/'deploy.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
  self.assertIs(deploy.runtime.verify_https,deploy.verify);self.assertEqual(deploy.runtime.VERSION,'2.4.1.5');self.assertEqual(deploy.runtime.REQUIRES,'2.4.1.4')
  module=deploy.prior
  while module is not None:self.assertEqual(module.CONFIG['version'],'2.4.1.5');module=getattr(module,'prior',None)
  calls=[];sheet=text(ROOT/'lab-service/public/brand.css').encode();study=text(ROOT/'lab-service/public/academic/index.html').encode()
  class Done:returncode=0
  deploy.prior.verify=lambda:calls.append('older')
  deploy.runtime.run=lambda args,check=True:(calls.append(args[2]),Done())[1]
  deploy.runtime.https=lambda host,route:sheet if route.startswith('/brand.css') else study
  deploy.verify()
  self.assertEqual(calls[0],'older');self.assertEqual(calls.count('calendar-app'),1);self.assertEqual(calls.count('garyhub-lab'),1)
  deploy.runtime.https=lambda host,route:(sheet+(b'x' if host=='tools.garyhub.uk' else b'')) if route.startswith('/brand.css') else study
  with self.assertRaisesRegex(RuntimeError,'accent or density'):deploy.verify()
  deploy.runtime.https=lambda host,route:sheet if route.startswith('/brand.css') else study.replace(b' data-gh-accent-off',b'')
  with self.assertRaisesRegex(RuntimeError,'opt out'):deploy.verify()
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('Settings now include accent colour, density, week start, date format, calendar view',s)
  for stale in ['settings centre is live','today panel','Code blocks','GLM']:self.assertNotIn(stale,s)
  prior=(PRIOR/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig').replace('\r\n','\n')
  self.assertEqual(len(delta(prior,s.replace('\r\n','\n'))),2)
 def test_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.1.5.json').read_text(encoding='utf-8'));self.assertEqual(r['version'],'garyhub-2.4.1.5');self.assertEqual(r['date'],'2026-11-18')
  self.assertEqual([n['scope'] for n in r['notes']],['home','tools'])
  self.assertTrue(all(n['title'] and n['body'] for n in r['notes']))
if __name__=='__main__':unittest.main()
