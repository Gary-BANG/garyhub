import difflib,hashlib,importlib.util,json,re,subprocess,tempfile,unittest
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.3.0'
PRIOR=ROOT/'scripts/releases/v2.4.2.0'
CONFIG=json.loads((HERE/'release-config.json').read_text(encoding='utf-8'))
BASE=CONFIG['reviewed_base_commit']
git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT)
# Read what Git stores (the index): a CRLF checkout of an unchanged text file is not a different release.
stored=lambda path:git('show',':'+Path(path).relative_to(ROOT).as_posix())
text=lambda path:stored(path).decode()
SHARED=['brand.css','hub-nav.js','hub-search.js','hub-search.css','hub-prefs.js','auth-redirect.js','favicon.svg','icons/icon-192.png','tools-catalog.js']
def local(a):
 base=ROOT/('calendar-app/public' if a['host']=='calendar.garyhub.uk' else 'lab-service/public')
 if a['host']=='sites.garyhub.uk':base=base/'sites'
 if a['host']=='games.garyhub.uk':base=base/'games'
 route=a['route']
 rel=('homepage.html' if a['host']=='garyhub.uk' else 'index.html') if route=='/' else route.lstrip('/')+'index.html' if route.endswith('/') else route.lstrip('/')
 return base/('admin.html' if rel=='admin/index.html' else rel)
delta=lambda a,b:[l for l in difflib.unified_diff(a.splitlines(),b.splitlines(),lineterm='',n=0) if l[:1] in '+-' and l[:3] not in ('+++','---')]
strip=lambda lines:[l[0]+l[1:].strip() for l in lines]
container=lambda path:ROOT/('calendar-app/'+path[len('/app/'):] if path.startswith('/app/') else 'lab-service/'+path[len('/lab/'):])
class ReleaseTests(unittest.TestCase):
 def test_manifest_and_strict_baseline(self):
  m=json.loads((ROOT/'releases/2.4.3.0.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['version'],'2.4.3.0');self.assertEqual(CONFIG['requires_release'],'2.4.2.0');self.assertEqual(m['requires_release'],'2.4.2.0')
  self.assertEqual(CONFIG['baseline_adapter'],'scripts/releases/v2.4.2.0')
  self.assertEqual(BASE,m['reviewed_base_commit']);self.assertEqual(BASE,'4511bd72a8b4310cb4f61e1e97bb04fa73c140e0');self.assertFalse(m['production_verified'])
  self.assertIn("BASE='"+BASE+"'",(HERE/'build-package.py').read_text())
  # The reviewed base is the merged v2.4.2.0 (PR #50); its tree is the v2.4.2.0 release commit.
  self.assertEqual(git('rev-parse',BASE+'^{tree}'),git('rev-parse','92b6de1^{tree}'))
  self.assertEqual(CONFIG['installer_build'],'v2.4.3.0-r1');self.assertEqual(m['installer_revision'],'r1')
  previous=json.loads((ROOT/'releases/2.4.2.0.json').read_text(encoding='utf-8'))['protections']
  self.assertEqual(m['protections'][:len(previous)],previous)
  for protection in ['caddy_unchanged_games_block_checked_read_only','room_socket_games_host_only','room_socket_session_and_origin_checked','room_hidden_words_and_secrets_until_reveal','room_clock_pauses_when_a_player_drops','computer_player_sees_only_its_seat']:
   self.assertIn(protection,m['protections'])
  self.assertEqual(json.loads((ROOT/'releases/current.json').read_text())['manifest'],'releases/2.4.3.0.json')
 def test_runtime_and_asset_hashes(self):
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums','games_asset_checksums']:
   for a in CONFIG[group]:
    with self.subTest(host=a['host'],route=a['route']):self.assertEqual(hashlib.sha256(stored(local(a))).hexdigest(),a['sha256'])
  for a in CONFIG['games_page_checksums']:
   self.assertEqual(a['file'],'/lab/public/games'+a['route']);self.assertEqual(hashlib.sha256(stored(container(a['file']))).hexdigest(),a['sha256'])
  self.assertEqual([a['route'] for a in CONFIG['games_page_checksums']],['/index.html','/dream/index.html','/play/index.html'])
  self.assertEqual([a['route'] for a in CONFIG['games_asset_checksums']][-4:],['/play/play.css','/play/play.js','/play/word.js','/play/digits.js'])
  for name,expected in CONFIG['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256(stored(ROOT/'calendar-app/stocks'/name)).hexdigest(),expected)
  public={(a['host'],a['route']) for a in CONFIG['asset_checksums']}
  for host,route in [('garyhub.uk','/'),('tools.garyhub.uk','/hub-search.js'),('calendar.garyhub.uk','/hub-search.js'),('tools.garyhub.uk','/companion/knowledge.js'),('garyhub.uk','/i18n/dictionary.js')]:
   self.assertIn((host,route),public)
 def test_shipped_files_keep_stored_line_endings(self):
  changed=[p for p in git('diff','--name-only',BASE,'--','calendar-app','lab-service').decode().split() if (ROOT/p).is_file()]
  for required in ['calendar-app/play-rooms.js','calendar-app/play-socket.js','calendar-app/play-word.js','calendar-app/play-digits.js','lab-service/games-host.cjs',
                   'lab-service/public/games/play/play.js','calendar-app/releases/garyhub-2.4.3.0.json']:self.assertIn(required,changed)
  for path in changed+['scripts/releases/v2.4.3.0/variant-overrides/1.3.4.1/'+rel for rel in ['calendar-app/app.js','lab-service/server.cjs']]:
   with self.subTest(path=path):self.assertEqual((ROOT/path).read_bytes(),stored(ROOT/path))
 def test_capability_variant_matches_the_main_change(self):
  for rel,size in [('calendar-app/app.js',7),('lab-service/server.cjs',7)]:
   main=strip(delta(git('show',BASE+':'+rel).decode(),text(ROOT/rel)))
   variant=strip(delta(git('show',BASE+':scripts/releases/v2.4.2.0/variant-overrides/1.3.4.1/'+rel).decode(),text(HERE/'variant-overrides/1.3.4.1'/rel)))
   self.assertEqual(main,variant,rel);self.assertEqual(len(main),size,rel)
  server=text(ROOT/'lab-service/server.cjs')
  # Earlier adapters look for these texts; the room route comes after the games routes.
  self.assertIn('me|preferences|notifications(?:',server);self.assertIn('|notify(?:\\/devices\\/\\d+\\/remove|\\/feed)?|games(?:',server)
  self.assertIn('reveal|honor))?)?|play|admin\\/users',server);self.assertIn("server.on('upgrade',games.upgrade);",server)
  self.assertIn("createGamesHost({identity,json,auth,calendarUrl:CALENDAR})",server)
  self.assertIn('hubVersion:"2.4.3.0"',server);self.assertIn('hubVersion: "2.4.3.0"',text(ROOT/'calendar-app/app.js'))
  app=text(ROOT/'calendar-app/app.js');self.assertIn('    attachExtras(app, server);\n',app);self.assertNotIn('*.garyhub.uk',app)
 def test_shared_copies_and_one_asset_version(self):
  for name in SHARED:
   with self.subTest(name=name):self.assertEqual(stored(ROOT/'calendar-app/public'/name),stored(ROOT/'lab-service/public'/name))
  for name in ['knowledge.js','panel.js','panel.css','pet.js','boot.js']:
   self.assertEqual(stored(ROOT/'calendar-app/public/companion'/name),stored(ROOT/'lab-service/public/companion'/name))
  # Only comments that record when a feature arrived (and earlier test data) may still name v2.4.2.0.
  for line in [l for l in git('grep','-n','-F','2.4.2.0','--','calendar-app','lab-service').decode().splitlines() if not l.startswith('calendar-app/releases/')]:
   self.assertNotRegex(line,r'\?v=2\.4\.2\.0|hubVersion|"version"|RELEASE=',line)
  self.assertIn("RELEASE='v2.4.3.0'",text(ROOT/'lab-service/academic.cjs'));self.assertEqual(json.loads(text(ROOT/'lab-service/public/academic/release.json'))['version'],'v2.4.3.0')
  for page in ['lab-service/public/games/index.html','lab-service/public/games/dream/index.html','lab-service/public/games/play/index.html']:
   self.assertNotIn('style=',text(ROOT/page));self.assertNotRegex(text(ROOT/page),r'<script>(?!</)')
   for ref in re.findall(r'(?:src|href)="(/[^"?]+\.(?:js|css))\?v=([\d.]+)"',text(ROOT/page)):self.assertEqual(ref[1],'2.4.3.0',page+' '+ref[0])
 def test_rooms_rules_and_entry_points(self):
  rooms=text(ROOT/'calendar-app/play-rooms.js');host=text(ROOT/'lab-service/games-host.cjs');page=text(ROOT/'lab-service/public/games/play/play.js')
  # One socket path everywhere; Lab upgrades only it, Calendar checks the origin and the session through the app.
  self.assertIn("SOCKET_PATH = '/api/hub/play/socket'",rooms);self.assertIn("const SOCKET = '/api/hub/play/socket';",host);self.assertIn("'/api/hub/play/socket'",page)
  self.assertIn("app.get(SOCKET_PATH, originGate, requireLogin, upgradeRoute);",rooms);self.assertIn("ORIGIN = 'https://games.garyhub.uk'",rooms)
  self.assertIn("connect-src 'self' wss://games.garyhub.uk;",host);self.assertIn('hub\\/play|hub\\/games(?:',host)
  self.assertIn("if (host !== HOST || req.url !== SOCKET || req.method !== 'GET') return reply(socket, 404, 'Not found');",host)
  for name in ['play-rooms.js','play-word.js','play-digits.js','play-socket.js']:
   source=text(ROOT/'calendar-app'/name);self.assertNotIn('REFERENCES users',source);self.assertNotIn("require('ws')",source)
  self.assertEqual(json.loads(text(ROOT/'calendar-app/package.json'))['dependencies'],json.loads(git('show',BASE+':calendar-app/package.json').decode())['dependencies'])
  self.assertIn("'dream_games','play_rooms'];",text(ROOT/'calendar-app/account-admin.js'))
  self.assertIn('<small>实时房间与轮流小游戏</small>',text(ROOT/'lab-service/public/homepage.html'))
  self.assertIn('词语默契 猜数字',text(ROOT/'lab-service/public/hub-search.js'))
  self.assertIn("'词语默契','默契游戏','猜数字'",text(ROOT/'lab-service/public/companion/knowledge.js'))
 def test_isolation_inputs(self):
  previous=json.loads((PRIOR/'release-config.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['isolation_checks'],previous['isolation_checks']+['play-http.cjs'])
  self.assertEqual(CONFIG['test_inputs']['play-http.cjs'],'scripts/releases/v2.4.3.0/tests/play-http.cjs')
  self.assertEqual(CONFIG['test_inputs']['asset-checks.json'],'scripts/releases/v2.4.3.0/release-config.json')
  self.assertEqual({k:v for k,v in CONFIG['test_inputs'].items() if k not in ['play-http.cjs','asset-checks.json']},{k:v for k,v in previous['test_inputs'].items() if k!='asset-checks.json'})
  for path in list(CONFIG['test_inputs'].values())+list(CONFIG['support_files'].values()):self.assertTrue((ROOT/path).is_file(),path)
  self.assertEqual(CONFIG['support_files']['prior_0420.py'],'scripts/releases/v2.4.2.0/deploy.py')
  suite=text(HERE/'tests/play-http.cjs')
  for ip in ['192.0.2.224','192.0.2.225','192.0.2.226']:self.assertIn("'"+ip+"'",suite)
  for other in [p for p in CONFIG['test_inputs'].values() if p.endswith('.cjs') and 'play-http' not in p]:
   for ip in ['192.0.2.224','192.0.2.225','192.0.2.226']:self.assertNotIn("'"+ip+"'",text(ROOT/other),other)
  self.assertEqual(git('diff','--name-only',BASE,'--','scripts/updater','scripts/releases/v2.4.2.0','scripts/releases/v2.4.1.6').decode().strip(),'')
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_caddy_is_only_read(self):
  deploy=self.load()
  self.assertEqual(sorted(deploy.runtime.HOOKS),['prepare'])
  with tempfile.TemporaryDirectory() as tmp:
   backup=Path(tmp);base='garyhub.uk {\n    reverse_proxy garyhub-lab:3000\n}\n'
   (backup/'Caddyfile').write_text(base+'\n'+deploy.prior.SITE_BLOCK)
   deploy.prepare({},{},{},backup)
   (backup/'Caddyfile').write_text(base)
   with self.assertRaisesRegex(RuntimeError,'v2.4.2.0 added.*Nothing was changed'):deploy.prepare({},{},{},backup)
   (backup/'Caddyfile').write_text(base+'games.garyhub.uk {\n    respond "x"\n}\n')
   with self.assertRaisesRegex(RuntimeError,'Nothing was changed'):deploy.prepare({},{},{},backup)
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_deploy_reuses_prior_checks(self):
  deploy=self.load()
  self.assertIs(deploy.runtime.verify_https,deploy.verify);self.assertEqual(deploy.runtime.VERSION,'2.4.3.0');self.assertEqual(deploy.runtime.REQUIRES,'2.4.2.0')
  module=deploy.prior
  while module is not None:self.assertEqual(module.CONFIG['version'],'2.4.3.0');module=getattr(module,'prior',None)
  # The room page is a login return route on both services; v2.4.2.0's marker was moved to the new list.
  for service,path in [('calendar-app','/app/public/auth-redirect.js'),('garyhub-lab','/lab/public/auth-redirect.js')]:
   self.assertEqual(deploy.prior.RUNNING[service][path],"'https://games.garyhub.uk':['/','/dream/','/play/']")
  # Every running-container marker of this and the earlier adapters is still in the files shipped now.
  module=deploy
  while module is not None:
   for service,expected in getattr(module,'RUNNING',{}).items():
    for path,marker in expected.items():
     with self.subTest(adapter=module.__name__,path=path):self.assertIn(marker,text(container(path)))
   module=getattr(module,'prior',None)
  calls=[]
  class Done:returncode=0;stdout=b''
  class Failed:returncode=1;stdout=b''
  def status_for(args):
   host=[a for a in args if str(a).endswith(':443:127.0.0.1')][0].split(':')[0];origin=[a for a in args if str(a).startswith('Origin: ')][0]
   if host!='games.garyhub.uk':return b'404'
   return b'401' if origin=='Origin: https://games.garyhub.uk' else b'403'
  def run(args,check=True):
   if args[0]=='curl':calls.append('socket '+[a for a in args if str(a).endswith(':443:127.0.0.1')][0]);r=Done();r.stdout=status_for(args);return r
   calls.append(args[2]);return Done()
  deploy.prior.verify=lambda:calls.append('older')
  def status(host,route,method='GET'):
   if route=='/api/hub/play':return b'403' if method=='POST' else b'401'
   return b'404'
  deploy.checks.status=status;deploy.runtime.run=run
  deploy.verify()
  self.assertEqual(calls[0],'older');self.assertEqual(calls.count('calendar-app'),2);self.assertEqual(calls.count('garyhub-lab'),1)
  self.assertEqual(sum(1 for c in calls if c.startswith('socket ')),4)
  deploy.runtime.run=lambda args,check=True:(lambda r:(setattr(r,'stdout',b'101'),r)[1])(Done()) if args[0]=='curl' else Done()
  with self.assertRaisesRegex(RuntimeError,'login gate'):deploy.verify()
  deploy.runtime.run=run;deploy.checks.status=lambda host,route,method='GET':b'200'
  with self.assertRaisesRegex(RuntimeError,'answers plain HTTP'):deploy.verify()
  deploy.checks.status=status
  deploy.runtime.run=lambda args,check=True:Failed() if 'sqlite_master' in str(args[-1]) else run(args)
  with self.assertRaisesRegex(RuntimeError,'Game rooms table'):deploy.verify()
 def load(self):
  spec=importlib.util.spec_from_file_location('deploy_0430_under_test',HERE/'deploy.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
  return deploy
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('Live rooms are open at https://games.garyhub.uk/play/ with Word Sync and Number Duel',s)
  for stale in ['Games is live at','Settings now arrange','GLM']:self.assertNotIn(stale,s)
  prior=(PRIOR/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig').replace('\r\n','\n')
  self.assertEqual(len(delta(prior,s.replace('\r\n','\n'))),2)
 def test_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.3.0.json').read_text(encoding='utf-8'));self.assertEqual(r['version'],'garyhub-2.4.3.0');self.assertEqual(r['date'],'2026-11-20')
  self.assertEqual([n['scope'] for n in r['notes']],['home'])
  self.assertTrue(all(n['title'] and n['body'] for n in r['notes']))
  for words in ['词语默契','对战猜数字','房间码','计时暂停']:self.assertIn(words,r['notes'][0]['body'])
if __name__=='__main__':unittest.main()
