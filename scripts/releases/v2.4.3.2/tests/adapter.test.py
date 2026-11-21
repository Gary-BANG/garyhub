import difflib,hashlib,importlib.util,json,re,subprocess,tempfile,unittest
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.3.2'
PRIOR=ROOT/'scripts/releases/v2.4.3.1'
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
  m=json.loads((ROOT/'releases/2.4.3.2.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['version'],'2.4.3.2');self.assertEqual(CONFIG['requires_release'],'2.4.3.1');self.assertEqual(m['requires_release'],'2.4.3.1')
  self.assertEqual(CONFIG['baseline_adapter'],'scripts/releases/v2.4.3.1')
  self.assertEqual(BASE,m['reviewed_base_commit']);self.assertEqual(BASE,'81ec1923e3d1ce8cecd2b3d8cbd935ba10d4e198');self.assertFalse(m['production_verified'])
  self.assertIn("BASE='"+BASE+"'",(HERE/'build-package.py').read_text())
  # The reviewed base is the merged v2.4.3.1 (PR #52); its tree is the v2.4.3.1 release commit.
  self.assertEqual(git('rev-parse',BASE+'^{tree}'),git('rev-parse','52bb82c^{tree}'))
  self.assertEqual(CONFIG['installer_build'],'v2.4.3.2-r1');self.assertEqual(m['installer_revision'],'r1')
  previous=json.loads((ROOT/'releases/2.4.3.1.json').read_text(encoding='utf-8'))['protections']
  self.assertEqual(m['protections'][:len(previous)],previous)
  for protection in ['autoplay_for_absent_or_repeatedly_late_players','autoplay_takeover_by_the_player','board_pause_only_when_no_player_online','treasure_chest_values_and_traps_hidden','computer_players_use_only_public_state']:
   self.assertIn(protection,m['protections'])
  self.assertEqual(json.loads((ROOT/'releases/current.json').read_text())['manifest'],'releases/2.4.3.2.json')
 def test_runtime_and_asset_hashes(self):
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums','games_asset_checksums']:
   for a in CONFIG[group]:
    with self.subTest(host=a['host'],route=a['route']):self.assertEqual(hashlib.sha256(stored(local(a))).hexdigest(),a['sha256'])
  for a in CONFIG['games_page_checksums']:
   self.assertEqual(a['file'],'/lab/public/games'+a['route']);self.assertEqual(hashlib.sha256(stored(container(a['file']))).hexdigest(),a['sha256'])
  self.assertEqual([a['route'] for a in CONFIG['games_page_checksums']],['/index.html','/dream/index.html','/play/index.html'])
  self.assertEqual([a['route'] for a in CONFIG['games_asset_checksums']][-3:],['/play/board.js','/play/treasure.js','/play/monopoly.js'])
  for name,expected in CONFIG['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256(stored(ROOT/'calendar-app/stocks'/name)).hexdigest(),expected)
 def test_shipped_files_keep_stored_line_endings(self):
  changed=[p for p in git('diff','--name-only',BASE,'--','calendar-app','lab-service').decode().split() if (ROOT/p).is_file()]
  for required in ['calendar-app/play-treasure.js','calendar-app/play-monopoly.js','calendar-app/play-rooms.js','lab-service/public/games/play/board.js','lab-service/public/games/play/treasure.js',
                   'lab-service/public/games/play/monopoly.js','lab-service/games-host.cjs','calendar-app/releases/garyhub-2.4.3.2.json']:self.assertIn(required,changed)
  for path in changed+['scripts/releases/v2.4.3.2/variant-overrides/1.3.4.1/'+rel for rel in ['calendar-app/app.js','lab-service/server.cjs']]:
   with self.subTest(path=path):self.assertEqual((ROOT/path).read_bytes(),stored(ROOT/path))
 def test_capability_variant_matches_the_main_change(self):
  # Only the version lines change in app.js and server.cjs this time.
  for rel in ['calendar-app/app.js','lab-service/server.cjs']:
   main=strip(delta(git('show',BASE+':'+rel).decode(),text(ROOT/rel)))
   variant=strip(delta(git('show',BASE+':scripts/releases/v2.4.3.1/variant-overrides/1.3.4.1/'+rel).decode(),text(HERE/'variant-overrides/1.3.4.1'/rel)))
   self.assertEqual(main,variant,rel);self.assertEqual(len(main),2,rel);self.assertTrue(all('2.4.3' in l for l in main),rel)
  server=text(ROOT/'lab-service/server.cjs')
  self.assertIn("server.on('upgrade',games.upgrade);",server);self.assertIn('reveal|honor))?)?|play|admin\\/users',server)
  self.assertIn('hubVersion:"2.4.3.2"',server);self.assertIn('hubVersion: "2.4.3.2"',text(ROOT/'calendar-app/app.js'))
 def test_shared_copies_one_asset_version_and_one_car_file(self):
  for name in SHARED:
   with self.subTest(name=name):self.assertEqual(stored(ROOT/'calendar-app/public'/name),stored(ROOT/'lab-service/public'/name))
  for name in ['knowledge.js','panel.js','panel.css','pet.js','boot.js']:
   self.assertEqual(stored(ROOT/'calendar-app/public/companion'/name),stored(ROOT/'lab-service/public/companion'/name))
  self.assertEqual(stored(ROOT/'calendar-app/play-car-sim.js'),stored(ROOT/'lab-service/public/games/play/car-sim.js'))
  for line in [l for l in git('grep','-n','-F','2.4.3.1','--','calendar-app','lab-service').decode().splitlines() if not l.startswith('calendar-app/releases/')]:
   self.assertNotRegex(line,r'\?v=2\.4\.3\.1|hubVersion|"version"|RELEASE=',line)
  self.assertIn("RELEASE='v2.4.3.2'",text(ROOT/'lab-service/academic.cjs'));self.assertEqual(json.loads(text(ROOT/'lab-service/public/academic/release.json'))['version'],'v2.4.3.2')
  for page in ['lab-service/public/games/index.html','lab-service/public/games/dream/index.html','lab-service/public/games/play/index.html']:
   self.assertNotIn('style=',text(ROOT/page));self.assertNotRegex(text(ROOT/page),r'<script>(?!</)')
   for ref in re.findall(r'(?:src|href)="(/[^"?]+\.(?:js|css))\?v=([\d.]+)"',text(ROOT/page)):self.assertEqual(ref[1],'2.4.3.2',page+' '+ref[0])
  page=text(ROOT/'lab-service/public/games/play/index.html')
  self.assertLess(page.index('/play/car-sim.js?v='),page.index('/play/car.js?v='))
  self.assertLess(page.index('/play/board.js?v='),min(page.index('/play/treasure.js?v='),page.index('/play/monopoly.js?v=')))
 def test_board_entry_points(self):
  rooms=text(ROOT/'calendar-app/play-rooms.js');host=text(ROOT/'lab-service/games-host.cjs');t=text(ROOT/'calendar-app/play-treasure.js');m=text(ROOT/'calendar-app/play-monopoly.js')
  self.assertIn("treasure: require('./play-treasure'), monopoly: require('./play-monopoly')",rooms);self.assertIn("'invite', 'takeover']",rooms)
  self.assertIn("const seatCount = (game, config) => game.seatCount ? game.seatCount(config) : game.seats;",rooms)
  self.assertIn("if (game.away === 'autoplay' && away >= 0 && humans(room).some(s => room.conns.has(s.user))) { room.auto[away] = true; changed(room); }",rooms)
  self.assertIn("if (GAMES[room.game].away === 'autoplay') room.seats.forEach((s, i) => { if (s.user && !room.conns.has(s.user)) room.auto[i] = true; });",rooms)
  for source in [t,m]:self.assertIn("away: 'autoplay'",source);self.assertIn("bots: ['easy', 'normal', 'smart']",source);self.assertNotIn('REFERENCES users',source)
  self.assertIn("chests: state.chests.map(c => ({pos: c.pos, type: c.type}))",t);self.assertIn("traps: state.traps.filter(t => t.owner === seat).map(t => t.pos)",t)
  self.assertNotIn('decks',m[m.index('function view(state)'):m.index('// ---- Computer player')])
  self.assertIn('board\\.js|treasure\\.js|monopoly\\.js',host)
  self.assertEqual(json.loads(text(ROOT/'calendar-app/package.json'))['dependencies'],json.loads(git('show',BASE+':calendar-app/package.json').decode())['dependencies'])
  lobby=text(ROOT/'lab-service/public/games/index.html')
  for game in ['treasure','monopoly']:self.assertIn('href="/play/?game='+game+'"',lobby)
  self.assertIn('骰子抢宝箱 抢宝箱 大富翁',text(ROOT/'lab-service/public/hub-search.js'))
 def test_isolation_inputs(self):
  previous=json.loads((PRIOR/'release-config.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['isolation_checks'],previous['isolation_checks']+['boards-http.cjs'])
  self.assertEqual(CONFIG['test_inputs']['boards-http.cjs'],'scripts/releases/v2.4.3.2/tests/boards-http.cjs')
  self.assertEqual(CONFIG['test_inputs']['asset-checks.json'],'scripts/releases/v2.4.3.2/release-config.json')
  self.assertEqual({k:v for k,v in CONFIG['test_inputs'].items() if k not in ['boards-http.cjs','asset-checks.json']},{k:v for k,v in previous['test_inputs'].items() if k!='asset-checks.json'})
  for path in list(CONFIG['test_inputs'].values())+list(CONFIG['support_files'].values()):self.assertTrue((ROOT/path).is_file(),path)
  self.assertEqual(CONFIG['support_files']['prior_0431.py'],'scripts/releases/v2.4.3.1/deploy.py')
  suite=text(HERE/'tests/boards-http.cjs')
  for ip in ['192.0.2.229','192.0.2.230']:self.assertIn("'"+ip+"'",suite)
  for other in [p for p in CONFIG['test_inputs'].values() if p.endswith('.cjs') and 'boards-http' not in p]:
   for ip in ['192.0.2.229','192.0.2.230']:self.assertNotIn("'"+ip+"'",text(ROOT/other),other)
  self.assertEqual(git('diff','--name-only',BASE,'--','scripts/updater','scripts/releases/v2.4.3.1','scripts/releases/v2.4.3.0').decode().strip(),'')
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_caddy_is_only_read(self):
  deploy=self.load()
  self.assertEqual(sorted(deploy.runtime.HOOKS),['prepare']);self.assertIs(deploy.runtime.HOOKS['prepare'],deploy.prior.prior.prepare)
  with tempfile.TemporaryDirectory() as tmp:
   backup=Path(tmp);base='garyhub.uk {\n    reverse_proxy garyhub-lab:3000\n}\n'
   (backup/'Caddyfile').write_text(base+'\n'+deploy.prior.prior.prior.SITE_BLOCK)
   deploy.runtime.HOOKS['prepare']({},{},{},backup)
   (backup/'Caddyfile').write_text(base)
   with self.assertRaisesRegex(RuntimeError,'Nothing was changed'):deploy.runtime.HOOKS['prepare']({},{},{},backup)
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_deploy_reuses_prior_checks(self):
  deploy=self.load()
  self.assertIs(deploy.runtime.verify_https,deploy.verify);self.assertEqual(deploy.runtime.VERSION,'2.4.3.2');self.assertEqual(deploy.runtime.REQUIRES,'2.4.3.1')
  module=deploy.prior
  while module is not None:self.assertEqual(module.CONFIG['version'],'2.4.3.2');module=getattr(module,'prior',None)
  module=deploy
  while module is not None:
   for service,expected in getattr(module,'RUNNING',{}).items():
    for path,marker in expected.items():
     with self.subTest(adapter=module.__name__,path=path):self.assertIn(marker,text(container(path)))
   module=getattr(module,'prior',None)
  calls=[]
  class Done:returncode=0;stdout=b''
  class Failed:returncode=1;stdout=b''
  deploy.prior.verify=lambda:calls.append('older')
  deploy.runtime.run=lambda args,check=True:(calls.append(args[2]),Done())[1]
  deploy.verify()
  self.assertEqual(calls,['older','calendar-app','garyhub-lab'])
  deploy.runtime.run=lambda args,check=True:Failed() if args[2]=='garyhub-lab' else Done()
  with self.assertRaisesRegex(RuntimeError,'Release change missing in running container: garyhub-lab'):deploy.verify()
 def load(self):
  spec=importlib.util.spec_from_file_location('deploy_0432_under_test',HERE/'deploy.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
  return deploy
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('Treasure Dash and Tycoon are open in the live rooms at https://games.garyhub.uk/play/',s)
  for stale in ['Co-op Car is open','Live rooms are open at','GLM']:self.assertNotIn(stale,s)
  prior=(PRIOR/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig').replace('\r\n','\n')
  self.assertEqual(len(delta(prior,s.replace('\r\n','\n'))),2)
 def test_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.3.2.json').read_text(encoding='utf-8'));self.assertEqual(r['version'],'garyhub-2.4.3.2');self.assertEqual(r['date'],'2026-11-21')
  self.assertEqual([n['scope'] for n in r['notes']],['home'])
  for words in ['骰子抢宝箱','大富翁','电脑对手','托管','接管']:self.assertIn(words,r['notes'][0]['body'])
if __name__=='__main__':unittest.main()
