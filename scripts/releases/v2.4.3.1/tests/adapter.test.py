import difflib,hashlib,importlib.util,json,re,subprocess,tempfile,unittest
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.3.1'
PRIOR=ROOT/'scripts/releases/v2.4.3.0'
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
  m=json.loads((ROOT/'releases/2.4.3.1.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['version'],'2.4.3.1');self.assertEqual(CONFIG['requires_release'],'2.4.3.0');self.assertEqual(m['requires_release'],'2.4.3.0')
  self.assertEqual(CONFIG['baseline_adapter'],'scripts/releases/v2.4.3.0')
  self.assertEqual(BASE,m['reviewed_base_commit']);self.assertEqual(BASE,'e61b20051c4db52b709b01cec04c736134ab0585');self.assertFalse(m['production_verified'])
  self.assertIn("BASE='"+BASE+"'",(HERE/'build-package.py').read_text())
  # The reviewed base is the merged v2.4.3.0 (PR #51); its tree is the v2.4.3.0 release commit.
  self.assertEqual(git('rev-parse',BASE+'^{tree}'),git('rev-parse','6021d8b^{tree}'))
  self.assertEqual(CONFIG['installer_build'],'v2.4.3.1-r1');self.assertEqual(m['installer_revision'],'r1')
  previous=json.loads((ROOT/'releases/2.4.3.0.json').read_text(encoding='utf-8'))['protections']
  self.assertEqual(m['protections'][:len(previous)],previous)
  for protection in ['car_physics_server_authoritative','car_controls_role_gated_per_seat','car_controls_released_on_disconnect','car_sim_same_file_on_server_and_page','realtime_inputs_rate_limited_without_disconnect']:
   self.assertIn(protection,m['protections'])
  self.assertEqual(json.loads((ROOT/'releases/current.json').read_text())['manifest'],'releases/2.4.3.1.json')
 def test_runtime_and_asset_hashes(self):
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums','games_asset_checksums']:
   for a in CONFIG[group]:
    with self.subTest(host=a['host'],route=a['route']):self.assertEqual(hashlib.sha256(stored(local(a))).hexdigest(),a['sha256'])
  for a in CONFIG['games_page_checksums']:
   self.assertEqual(a['file'],'/lab/public/games'+a['route']);self.assertEqual(hashlib.sha256(stored(container(a['file']))).hexdigest(),a['sha256'])
  self.assertEqual([a['route'] for a in CONFIG['games_page_checksums']],['/index.html','/dream/index.html','/play/index.html'])
  self.assertEqual([a['route'] for a in CONFIG['games_asset_checksums']][-2:],['/play/car.js','/play/car-sim.js'])
  for name,expected in CONFIG['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256(stored(ROOT/'calendar-app/stocks'/name)).hexdigest(),expected)
 def test_shipped_files_keep_stored_line_endings(self):
  changed=[p for p in git('diff','--name-only',BASE,'--','calendar-app','lab-service').decode().split() if (ROOT/p).is_file()]
  for required in ['calendar-app/play-car.js','calendar-app/play-car-sim.js','calendar-app/play-rooms.js','lab-service/public/games/play/car.js',
                   'lab-service/public/games/play/car-sim.js','lab-service/games-host.cjs','calendar-app/releases/garyhub-2.4.3.1.json']:self.assertIn(required,changed)
  for path in changed+['scripts/releases/v2.4.3.1/variant-overrides/1.3.4.1/'+rel for rel in ['calendar-app/app.js','lab-service/server.cjs']]:
   with self.subTest(path=path):self.assertEqual((ROOT/path).read_bytes(),stored(ROOT/path))
 def test_capability_variant_matches_the_main_change(self):
  # Only the version lines change in app.js and server.cjs this time.
  for rel in ['calendar-app/app.js','lab-service/server.cjs']:
   main=strip(delta(git('show',BASE+':'+rel).decode(),text(ROOT/rel)))
   variant=strip(delta(git('show',BASE+':scripts/releases/v2.4.3.0/variant-overrides/1.3.4.1/'+rel).decode(),text(HERE/'variant-overrides/1.3.4.1'/rel)))
   self.assertEqual(main,variant,rel);self.assertEqual(len(main),2,rel);self.assertTrue(all('2.4.3' in l for l in main),rel)
  server=text(ROOT/'lab-service/server.cjs')
  self.assertIn("server.on('upgrade',games.upgrade);",server);self.assertIn('reveal|honor))?)?|play|admin\\/users',server)
  self.assertIn('hubVersion:"2.4.3.1"',server);self.assertIn('hubVersion: "2.4.3.1"',text(ROOT/'calendar-app/app.js'))
 def test_shared_copies_one_asset_version_and_one_car_file(self):
  for name in SHARED:
   with self.subTest(name=name):self.assertEqual(stored(ROOT/'calendar-app/public'/name),stored(ROOT/'lab-service/public'/name))
  for name in ['knowledge.js','panel.js','panel.css','pet.js','boot.js']:
   self.assertEqual(stored(ROOT/'calendar-app/public/companion'/name),stored(ROOT/'lab-service/public/companion'/name))
  self.assertEqual(stored(ROOT/'calendar-app/play-car-sim.js'),stored(ROOT/'lab-service/public/games/play/car-sim.js'))
  for line in [l for l in git('grep','-n','-F','2.4.3.0','--','calendar-app','lab-service').decode().splitlines() if not l.startswith('calendar-app/releases/')]:
   self.assertNotRegex(line,r'\?v=2\.4\.3\.0|hubVersion|"version"|RELEASE=',line)
  self.assertIn("RELEASE='v2.4.3.1'",text(ROOT/'lab-service/academic.cjs'));self.assertEqual(json.loads(text(ROOT/'lab-service/public/academic/release.json'))['version'],'v2.4.3.1')
  for page in ['lab-service/public/games/index.html','lab-service/public/games/dream/index.html','lab-service/public/games/play/index.html']:
   self.assertNotIn('style=',text(ROOT/page));self.assertNotRegex(text(ROOT/page),r'<script>(?!</)')
   for ref in re.findall(r'(?:src|href)="(/[^"?]+\.(?:js|css))\?v=([\d.]+)"',text(ROOT/page)):self.assertEqual(ref[1],'2.4.3.1',page+' '+ref[0])
  page=text(ROOT/'lab-service/public/games/play/index.html')
  self.assertLess(page.index('/play/car-sim.js?v='),page.index('/play/car.js?v='))
 def test_car_and_realtime_entry_points(self):
  rooms=text(ROOT/'calendar-app/play-rooms.js');host=text(ROOT/'lab-service/games-host.cjs');car=text(ROOT/'calendar-app/play-car.js')
  self.assertIn("car: require('./play-car')",rooms);self.assertIn('function realtime(conn, message, now)',rooms);self.assertIn('function loop(room)',rooms)
  self.assertIn("game.drop?.(room.state, seat)",rooms);self.assertIn("GAMES[room.game].resume?.(room.state);",rooms)
  self.assertIn("if (message.t === 'in' || message.t === 'say')",rooms)
  self.assertIn('realtime: {hz: 20, send: 20}',car);self.assertIn("grace: 3000",car);self.assertIn("require('./play-car-sim')",car)
  self.assertIn('car\\.js|car-sim\\.js',host)
  for name in ['play-car.js','play-car-sim.js','play-rooms.js']:
   source=text(ROOT/'calendar-app'/name);self.assertNotIn('REFERENCES users',source);self.assertNotIn("require('ws')",source)
  self.assertEqual(json.loads(text(ROOT/'calendar-app/package.json'))['dependencies'],json.loads(git('show',BASE+':calendar-app/package.json').decode())['dependencies'])
  self.assertIn('href="/play/?game=car"',text(ROOT/'lab-service/public/games/index.html'))
 def test_isolation_inputs(self):
  previous=json.loads((PRIOR/'release-config.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['isolation_checks'],previous['isolation_checks']+['car-http.cjs'])
  self.assertEqual(CONFIG['test_inputs']['car-http.cjs'],'scripts/releases/v2.4.3.1/tests/car-http.cjs')
  self.assertEqual(CONFIG['test_inputs']['asset-checks.json'],'scripts/releases/v2.4.3.1/release-config.json')
  self.assertEqual({k:v for k,v in CONFIG['test_inputs'].items() if k not in ['car-http.cjs','asset-checks.json']},{k:v for k,v in previous['test_inputs'].items() if k!='asset-checks.json'})
  for path in list(CONFIG['test_inputs'].values())+list(CONFIG['support_files'].values()):self.assertTrue((ROOT/path).is_file(),path)
  self.assertEqual(CONFIG['support_files']['prior_0430.py'],'scripts/releases/v2.4.3.0/deploy.py')
  suite=text(HERE/'tests/car-http.cjs')
  for ip in ['192.0.2.227','192.0.2.228']:self.assertIn("'"+ip+"'",suite)
  for other in [p for p in CONFIG['test_inputs'].values() if p.endswith('.cjs') and 'car-http' not in p]:
   for ip in ['192.0.2.227','192.0.2.228']:self.assertNotIn("'"+ip+"'",text(ROOT/other),other)
  self.assertEqual(git('diff','--name-only',BASE,'--','scripts/updater','scripts/releases/v2.4.3.0','scripts/releases/v2.4.2.0').decode().strip(),'')
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_caddy_is_only_read(self):
  deploy=self.load()
  self.assertEqual(sorted(deploy.runtime.HOOKS),['prepare']);self.assertIs(deploy.runtime.HOOKS['prepare'],deploy.prior.prepare)
  with tempfile.TemporaryDirectory() as tmp:
   backup=Path(tmp);base='garyhub.uk {\n    reverse_proxy garyhub-lab:3000\n}\n'
   (backup/'Caddyfile').write_text(base+'\n'+deploy.prior.prior.SITE_BLOCK)
   deploy.runtime.HOOKS['prepare']({},{},{},backup)
   (backup/'Caddyfile').write_text(base)
   with self.assertRaisesRegex(RuntimeError,'Nothing was changed'):deploy.runtime.HOOKS['prepare']({},{},{},backup)
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_deploy_reuses_prior_checks(self):
  deploy=self.load()
  self.assertIs(deploy.runtime.verify_https,deploy.verify);self.assertEqual(deploy.runtime.VERSION,'2.4.3.1');self.assertEqual(deploy.runtime.REQUIRES,'2.4.3.0')
  module=deploy.prior
  while module is not None:self.assertEqual(module.CONFIG['version'],'2.4.3.1');module=getattr(module,'prior',None)
  module=deploy
  while module is not None:
   for service,expected in getattr(module,'RUNNING',{}).items():
    for path,marker in expected.items():
     with self.subTest(adapter=module.__name__,path=path):self.assertIn(marker,text(container(path)))
   module=getattr(module,'prior',None)
  calls=[];same=hashlib.sha256(stored(ROOT/'calendar-app/play-car-sim.js')).hexdigest().encode()
  class Done:returncode=0;stdout=b''
  class Failed:returncode=1;stdout=b''
  def run(args,check=True,digest=lambda service:same):
   calls.append(args[2]);r=Done()
   if 'createHash' in str(args[5]):r.stdout=digest(args[2])
   return r
  deploy.prior.verify=lambda:calls.append('older')
  deploy.runtime.run=run
  deploy.verify()
  self.assertEqual(calls[0],'older');self.assertEqual(calls.count('calendar-app'),2);self.assertEqual(calls.count('garyhub-lab'),2)
  deploy.runtime.run=lambda args,check=True:run(args,check,lambda service:same if service=='calendar-app' else b'0'*64)
  with self.assertRaisesRegex(RuntimeError,'differs between Calendar and the page'):deploy.verify()
  deploy.runtime.run=lambda args,check=True:Failed() if 'Release change missing' in str(args[5]) else run(args)
  with self.assertRaisesRegex(RuntimeError,'Release change missing'):deploy.verify()
 def load(self):
  spec=importlib.util.spec_from_file_location('deploy_0431_under_test',HERE/'deploy.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
  return deploy
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('Co-op Car is open in the live rooms at https://games.garyhub.uk/play/',s)
  for stale in ['Live rooms are open at','Games is live at','GLM']:self.assertNotIn(stale,s)
  prior=(PRIOR/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig').replace('\r\n','\n')
  self.assertEqual(len(delta(prior,s.replace('\r\n','\n'))),2)
 def test_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.3.1.json').read_text(encoding='utf-8'));self.assertEqual(r['version'],'garyhub-2.4.3.1');self.assertEqual(r['date'],'2026-11-20')
  self.assertEqual([n['scope'] for n in r['notes']],['home'])
  for words in ['合作小车','方向','油门','掉线会暂停','操作回显']:self.assertIn(words,r['notes'][0]['body'])
if __name__=='__main__':unittest.main()
