import difflib,hashlib,importlib.util,json,re,subprocess,unittest
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.1.6'
PRIOR=ROOT/'scripts/releases/v2.4.1.5'
CONFIG=json.loads((HERE/'release-config.json').read_text(encoding='utf-8'))
BASE=CONFIG['reviewed_base_commit']
git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT)
# Read what Git stores (the index): a CRLF checkout of an unchanged text file is not a different release.
stored=lambda path:git('show',':'+Path(path).relative_to(ROOT).as_posix())
text=lambda path:stored(path).decode()
SHARED=['brand.css','hub-nav.js','hub-search.js','hub-search.css','hub-prefs.js','favicon.svg','icons/icon-192.png','tools-catalog.js']
def local(a):
 base=ROOT/('calendar-app/public' if a['host']=='calendar.garyhub.uk' else 'lab-service/public')
 if a['host']=='sites.garyhub.uk':base=base/'sites'
 route=a['route']
 rel=('homepage.html' if a['host']=='garyhub.uk' else 'index.html') if route=='/' else route.lstrip('/')+'index.html' if route.endswith('/') else route.lstrip('/')
 return base/('admin.html' if rel=='admin/index.html' else rel)
delta=lambda a,b:[l for l in difflib.unified_diff(a.splitlines(),b.splitlines(),lineterm='',n=0) if l[:1] in '+-' and l[:3] not in ('+++','---')]
strip=lambda lines:[l[0]+l[1:].strip() for l in lines]
container=lambda path:ROOT/('calendar-app/'+path[len('/app/'):] if path.startswith('/app/') else 'lab-service/'+path[len('/lab/'):])
class ReleaseTests(unittest.TestCase):
 def test_manifest_and_strict_baseline(self):
  m=json.loads((ROOT/'releases/2.4.1.6.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['version'],'2.4.1.6');self.assertEqual(CONFIG['requires_release'],'2.4.1.5');self.assertEqual(m['requires_release'],'2.4.1.5')
  self.assertEqual(CONFIG['baseline_adapter'],'scripts/releases/v2.4.1.5')
  self.assertEqual(BASE,m['reviewed_base_commit']);self.assertEqual(BASE,'d0e49a9643a32fa3c64a9774680e457c3b29c8e9');self.assertFalse(m['production_verified'])
  self.assertIn("BASE='"+BASE+"'",(HERE/'build-package.py').read_text())
  # The reviewed base is the merged v2.4.1.5 (PR #48); its tree is the v2.4.1.5 release commit.
  self.assertEqual(git('rev-parse',BASE+'^{tree}'),git('rev-parse','40e3856^{tree}'))
  self.assertEqual(CONFIG['installer_build'],'v2.4.1.6-r1');self.assertEqual(m['installer_revision'],'r1')
  for protection in ['notification_channels_account_scoped_and_validated','release_notes_always_in_app','push_devices_owner_only','email_reminder_hold_without_worker_change']:
   self.assertIn(protection,m['protections'])
  self.assertEqual(json.loads((ROOT/'releases/current.json').read_text())['manifest'],'releases/2.4.1.6.json')
 def test_runtime_and_asset_hashes(self):
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums']:
   for a in CONFIG[group]:
    with self.subTest(host=a['host'],route=a['route']):self.assertEqual(hashlib.sha256(stored(local(a))).hexdigest(),a['sha256'])
  for name,expected in CONFIG['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256(stored(ROOT/'calendar-app/stocks'/name)).hexdigest(),expected)
  public={(a['host'],a['route']) for a in CONFIG['asset_checksums']}
  for host,route in [('calendar.garyhub.uk','/calendar-extras.js'),('calendar.garyhub.uk','/unified.js'),('tools.garyhub.uk','/tools-dock.js'),('tools.garyhub.uk','/tools-dock.css'),
                     ('tools.garyhub.uk','/personalize/settings.js'),('tools.garyhub.uk','/personalize/settings.css'),('garyhub.uk','/home/today.js'),('garyhub.uk','/home/home.css')]:
   self.assertIn((host,route),public)
 def test_shipped_files_keep_stored_line_endings(self):
  changed=[p for p in git('diff','--name-only',BASE,'--','calendar-app','lab-service').decode().split() if (ROOT/p).is_file()]
  for required in ['calendar-app/notify-api.js','calendar-app/notify-channels.js','lab-service/public/tools-dock.js']:self.assertIn(required,changed)
  for path in changed+['scripts/releases/v2.4.1.6/variant-overrides/1.3.4.1/'+rel for rel in ['calendar-app/app.js','lab-service/server.cjs']]:
   with self.subTest(path=path):self.assertEqual((ROOT/path).read_bytes(),stored(ROOT/path))
 def test_capability_variant_matches_the_main_change(self):
  for rel,size in [('calendar-app/app.js',2),('lab-service/server.cjs',4)]:
   main=strip(delta(git('show',BASE+':'+rel).decode(),text(ROOT/rel)))
   variant=strip(delta(git('show',BASE+':scripts/releases/v2.4.1.5/variant-overrides/1.3.4.1/'+rel).decode(),text(HERE/'variant-overrides/1.3.4.1'/rel)))
   self.assertEqual(main,variant,rel);self.assertEqual(len(main),size,rel)
  server=text(ROOT/'lab-service/server.cjs')
  # The v2.4.1.4 check looks for this text; the notification routes come after it.
  self.assertIn('me|preferences|notifications(?:',server);self.assertIn('|notify(?:\\/devices\\/\\d+\\/remove|\\/feed)?|',server)
  self.assertIn('hubVersion:"2.4.1.6"',server);self.assertIn('hubVersion: "2.4.1.6"',text(ROOT/'calendar-app/app.js'))
 def test_shared_copies_and_one_asset_version(self):
  for name in SHARED:
   with self.subTest(name=name):self.assertEqual(stored(ROOT/'calendar-app/public'/name),stored(ROOT/'lab-service/public'/name))
  for name in ['knowledge.js','panel.js','panel.css','pet.js','boot.js']:
   self.assertEqual(stored(ROOT/'calendar-app/public/companion'/name),stored(ROOT/'lab-service/public/companion'/name))
  # Only comments that record when a feature arrived may still name v2.4.1.5.
  for line in [l for l in git('grep','-n','-F','2.4.1.5','--','calendar-app','lab-service').decode().splitlines() if not l.startswith('calendar-app/releases/')]:
   self.assertRegex(line,r'v2\.4\.1\.5[ :).,]',line);self.assertNotRegex(line,r'\?v=2\.4\.1\.5|hubVersion|"version"|RELEASE=',line)
  # The Study Hub reports the release it runs in (checked by study-http.cjs), so its marker moves with the app.
  self.assertIn("RELEASE='v2.4.1.6'",text(ROOT/'lab-service/academic.cjs'));self.assertEqual(json.loads(text(ROOT/'lab-service/public/academic/release.json'))['version'],'v2.4.1.6')
 def test_preference_schema(self):
  api=text(ROOT/'calendar-app/preferences-api.js')
  for marker in ["'home.cards': list(['schedule', 'todos', 'study', 'notices', 'budget'], 5)","'home.portals': list(['tools', 'calendar', 'study', 'sites'], 4)","'tools.pinned': list(TOOLS, 8)",
                 "'tools.recent': list(TOOLS, 6)","'push.quietFrom': HALF_HOURS","'tasks.reminder': ['once', 'twice']","new Set(value).size === value.length"]:
   self.assertIn(marker,api)
  for kind,channels in {'updates':['push','email'],'reminders':['inApp','push','email'],'alerts':['inApp','push','email']}.items():
   for channel in channels:self.assertIn("'notify."+kind+'.'+channel+"': BOOL",api)
  self.assertNotIn("'notify.updates.inApp'",api)
  # Tool ids are the tools desk catalogue.
  catalogue=re.findall(r"\{id:'([a-z-]+)'",text(ROOT/'lab-service/public/tools-catalog.js'))
  self.assertEqual(re.search(r"const TOOLS = \[([^\]]+)\]",api,re.S).group(1).replace("'",'').replace('\n','').replace(' ','').split(','),catalogue)
  channels=text(ROOT/'calendar-app/notify-channels.js')
  self.assertIn("reminders: {inApp: false, push: true, email: true}",channels);self.assertIn('out.updates.inApp = true;',channels)
 def test_pages_and_routes(self):
  for rel,marker in [('lab-service/public/home/today.js',"pref('home.cards')"),('lab-service/public/home/today.js',"pref('home.portals')"),('lab-service/public/home/today.js','/api/hub/today'),
                     ('lab-service/public/tools-dock.js',"prefList('tools.pinned')"),('lab-service/public/tools-dock.js',"{now: true}"),('lab-service/public/hub-prefs.js','keepalive: true'),
                     ('lab-service/public/personalize/settings.js',"'notify/devices/'"),('lab-service/public/personalize/settings.js','GaryHubPrefs.saveNow'),('lab-service/public/personalize/settings.js',"'appearance.accent'"),
                     ('lab-service/public/personalize/index.html','<script src="/tools-catalog.js?v=2.4.1.6"></script>'),('lab-service/public/homepage.html','/home/home.css?v=2.4.1.6'),
                     ('lab-service/public/index.html','/tools-dock.css?v=2.4.1.6'),('calendar-app/public/unified.js','function applyReminderDefault()'),
                     ('calendar-app/public/calendar-extras.js',"SETTINGS='https://tools.garyhub.uk/personalize/#notify'"),('calendar-app/account-admin.js',"'user_preferences','notify_deliveries'"),
                     ('calendar-app/extras.js','notify.register(app, {db, requireLogin})')]:
   with self.subTest(file=rel,marker=marker):self.assertIn(marker,text(ROOT/rel))
  # The e-mail reminder hold relies on the worker's own rules: unique slot rows and only pending/failed rows sent.
  worker=text(ROOT/'calendar-app/reminder-worker.js');schema=text(ROOT/'calendar-app/migrations/unified-schema.js')
  self.assertIn('INSERT OR IGNORE INTO reminder_deliveries',worker);self.assertIn("d.status IN ('pending','failed')",worker);self.assertIn('UNIQUE(task_id, local_date, local_time)',schema)
  self.assertEqual(git('diff','--name-only',BASE,'--','calendar-app/reminder-worker.js','calendar-app/migrations').decode().strip(),'')
 def test_isolation_inputs(self):
  previous=json.loads((PRIOR/'release-config.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['isolation_checks'],previous['isolation_checks']+['notify-http.cjs'])
  for name in ['prefs-http.cjs','notify-http.cjs']:self.assertEqual(CONFIG['test_inputs'][name],'scripts/releases/v2.4.1.6/tests/'+name)
  self.assertEqual(CONFIG['test_inputs']['study-http.cjs'],'scripts/releases/v2.4.1.5/tests/study-http.cjs')
  old=git('show','HEAD:scripts/releases/v2.4.1.5/tests/prefs-http.cjs').decode();new=text(HERE/'tests/prefs-http.cjs')
  self.assertEqual([l for l in strip(delta(old,new)) if not l[1:].startswith('//')],
   ["-const empty=await alice.get();eq(empty.accountId,alice.me.id);eq(empty.revision,0);eq(Object.keys(empty.prefs).length,15);ok(Object.values(empty.prefs).every(v=>v===null),'defaults are unset');",
    "+const empty=await alice.get();eq(empty.accountId,alice.me.id);eq(empty.revision,0);eq(Object.keys(empty.prefs).length,33);ok(Object.values(empty.prefs).every(v=>v===null),'defaults are unset');"])
  for path in list(CONFIG['test_inputs'].values())+list(CONFIG['support_files'].values()):self.assertTrue((ROOT/path).is_file(),path)
  self.assertEqual(CONFIG['support_files']['prior_0415.py'],'scripts/releases/v2.4.1.5/deploy.py')
  # The new suite has its own login addresses.
  suite=text(HERE/'tests/notify-http.cjs')
  for ip in ['192.0.2.236','192.0.2.237','192.0.2.238']:self.assertIn("'"+ip+"'",suite)
  for other in [p for p in CONFIG['test_inputs'].values() if p.endswith('.cjs') and 'notify-http' not in p]:
   for ip in ['192.0.2.236','192.0.2.237','192.0.2.238']:self.assertNotIn("'"+ip+"'",text(ROOT/other),other)
  self.assertEqual(git('diff','--name-only',BASE,'--','scripts/updater','scripts/releases/v2.3.2.3','scripts/releases/v2.4.0.4','scripts/releases/v2.4.1.0','scripts/releases/v2.4.1.1',
   'scripts/releases/v2.4.1.2','scripts/releases/v2.4.1.3','scripts/releases/v2.4.1.4','scripts/releases/v2.4.1.5').decode().strip(),'')
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_deploy_reuses_prior_checks(self):
  spec=importlib.util.spec_from_file_location('deploy_0416_under_test',HERE/'deploy.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
  self.assertIs(deploy.runtime.verify_https,deploy.verify);self.assertEqual(deploy.runtime.VERSION,'2.4.1.6');self.assertEqual(deploy.runtime.REQUIRES,'2.4.1.5')
  module=deploy.prior
  while module is not None:self.assertEqual(module.CONFIG['version'],'2.4.1.6');module=getattr(module,'prior',None)
  # Every running-container marker of this and the earlier v2.4.1.x adapters is still in the files shipped now.
  module=deploy
  while module is not None:
   for service,expected in getattr(module,'RUNNING',{}).items():
    for path,marker in expected.items():
     with self.subTest(adapter=module.__name__,path=path):self.assertIn(marker,text(container(path)))
   module=getattr(module,'prior',None)
  calls=[];pages={'/home/today.js':b"x 'home.cards' x",'/tools-dock.js':b"x 'tools.recent' x",'/personalize/settings.js':b'x notify/devices/ x'}
  class Done:returncode=0
  class Failed:returncode=1
  deploy.prior.verify=lambda:calls.append('older')
  deploy.checks.status=lambda host,route,method='GET':b'401' if method=='GET' else b'403'
  deploy.runtime.run=lambda args,check=True:(calls.append(args[2]),Done())[1]
  deploy.runtime.https=lambda host,route:pages[route.split('?')[0]]
  deploy.verify()
  self.assertEqual(calls[0],'older');self.assertEqual(calls.count('calendar-app'),2);self.assertEqual(calls.count('garyhub-lab'),1)
  deploy.runtime.https=lambda host,route:b'old page'
  with self.assertRaisesRegex(RuntimeError,'missing its change'):deploy.verify()
  deploy.runtime.https=lambda host,route:pages[route.split('?')[0]]
  deploy.checks.status=lambda host,route,method='GET':b'200'
  with self.assertRaisesRegex(RuntimeError,'authentication gate'):deploy.verify()
  deploy.checks.status=lambda host,route,method='GET':b'401' if method=='GET' else b'403'
  deploy.runtime.run=lambda args,check=True:Failed() if 'PRAGMA' in args[-1] else Done()
  with self.assertRaisesRegex(RuntimeError,'device label column'):deploy.verify()
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('Settings now arrange the homepage cards and tools desk',s)
  for stale in ['accent colour, density','settings centre is live','today panel','GLM']:self.assertNotIn(stale,s)
  prior=(PRIOR/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig').replace('\r\n','\n')
  self.assertEqual(len(delta(prior,s.replace('\r\n','\n'))),2)
 def test_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.1.6.json').read_text(encoding='utf-8'));self.assertEqual(r['version'],'garyhub-2.4.1.6');self.assertEqual(r['date'],'2026-11-18')
  self.assertEqual([n['scope'] for n in r['notes']],['home','tools','calendar'])
  self.assertTrue(all(n['title'] and n['body'] for n in r['notes']))
if __name__=='__main__':unittest.main()
