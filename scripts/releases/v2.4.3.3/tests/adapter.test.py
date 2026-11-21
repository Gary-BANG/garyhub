import difflib,hashlib,importlib.util,json,re,subprocess,tempfile,unittest
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.3.3'
PRIOR=ROOT/'scripts/releases/v2.4.3.2'
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
  m=json.loads((ROOT/'releases/2.4.3.3.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['version'],'2.4.3.3');self.assertEqual(CONFIG['requires_release'],'2.4.3.2');self.assertEqual(m['requires_release'],'2.4.3.2')
  self.assertEqual(CONFIG['baseline_adapter'],'scripts/releases/v2.4.3.2')
  self.assertEqual(BASE,m['reviewed_base_commit']);self.assertEqual(BASE,'731e8bcac1935c2f45e496d085fa8cc571d35304');self.assertFalse(m['production_verified'])
  self.assertIn("BASE='"+BASE+"'",(HERE/'build-package.py').read_text())
  # The reviewed base is the merged v2.4.3.2 (PR #53); its tree is the v2.4.3.2 release commit.
  self.assertEqual(git('rev-parse',BASE+'^{tree}'),git('rev-parse','a52d929^{tree}'))
  self.assertEqual(CONFIG['installer_build'],'v2.4.3.3-r1');self.assertEqual(m['installer_revision'],'r1')
  previous=json.loads((ROOT/'releases/2.4.3.2.json').read_text(encoding='utf-8'))['protections']
  self.assertEqual(m['protections'][:len(previous)],previous)
  for protection in ['tycoon_old_rooms_keep_old_rules','tycoon_trade_revalidated_on_accept','tycoon_trade_answer_only_by_recipient','tycoon_auction_bids_in_turn_within_cash','tycoon_autoplay_never_trades_or_bids','tycoon_computer_reasons_only_from_computer_moves']:
   self.assertIn(protection,m['protections'])
  self.assertEqual(json.loads((ROOT/'releases/current.json').read_text())['manifest'],'releases/2.4.3.3.json')
 def test_runtime_and_asset_hashes(self):
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums','games_asset_checksums']:
   for a in CONFIG[group]:
    with self.subTest(host=a['host'],route=a['route']):self.assertEqual(hashlib.sha256(stored(local(a))).hexdigest(),a['sha256'])
  for a in CONFIG['games_page_checksums']:
   self.assertEqual(a['file'],'/lab/public/games'+a['route']);self.assertEqual(hashlib.sha256(stored(container(a['file']))).hexdigest(),a['sha256'])
  self.assertEqual([a['route'] for a in CONFIG['games_page_checksums']],['/index.html','/dream/index.html','/play/index.html'])
  previous=json.loads((PRIOR/'release-config.json').read_text(encoding='utf-8'))
  self.assertEqual([a['route'] for a in CONFIG['games_asset_checksums']],[a['route'] for a in previous['games_asset_checksums']])
  for name,expected in CONFIG['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256(stored(ROOT/'calendar-app/stocks'/name)).hexdigest(),expected)
 def test_shipped_files_keep_stored_line_endings(self):
  changed=[p for p in git('diff','--name-only',BASE,'--','calendar-app','lab-service').decode().split() if (ROOT/p).is_file()]
  for required in ['calendar-app/play-monopoly.js','calendar-app/play-rooms.js','lab-service/public/games/play/board.js','lab-service/public/games/play/monopoly.js',
                   'lab-service/public/games/play/play.js','lab-service/public/games/play/play.css','lab-service/public/games/play/index.html','calendar-app/releases/garyhub-2.4.3.3.json']:self.assertIn(required,changed)
  for path in changed+['scripts/releases/v2.4.3.3/variant-overrides/1.3.4.1/'+rel for rel in ['calendar-app/app.js','lab-service/server.cjs']]:
   with self.subTest(path=path):self.assertEqual((ROOT/path).read_bytes(),stored(ROOT/path))
 def test_capability_variant_matches_the_main_change(self):
  # Only the version lines change in app.js and server.cjs this time.
  for rel in ['calendar-app/app.js','lab-service/server.cjs']:
   main=strip(delta(git('show',BASE+':'+rel).decode(),text(ROOT/rel)))
   variant=strip(delta(git('show',BASE+':scripts/releases/v2.4.3.2/variant-overrides/1.3.4.1/'+rel).decode(),text(HERE/'variant-overrides/1.3.4.1'/rel)))
   self.assertEqual(main,variant,rel);self.assertEqual(len(main),2,rel);self.assertTrue(all('2.4.3' in l for l in main),rel)
  server=text(ROOT/'lab-service/server.cjs')
  self.assertIn("server.on('upgrade',games.upgrade);",server);self.assertIn('reveal|honor))?)?|play|admin\\/users',server)
  self.assertIn('hubVersion:"2.4.3.3"',server);self.assertIn('hubVersion: "2.4.3.3"',text(ROOT/'calendar-app/app.js'))
 def test_shared_copies_one_asset_version_and_one_car_file(self):
  for name in SHARED:
   with self.subTest(name=name):self.assertEqual(stored(ROOT/'calendar-app/public'/name),stored(ROOT/'lab-service/public'/name))
  for name in ['knowledge.js','panel.js','panel.css','pet.js','boot.js']:
   self.assertEqual(stored(ROOT/'calendar-app/public/companion'/name),stored(ROOT/'lab-service/public/companion'/name))
  self.assertEqual(stored(ROOT/'calendar-app/play-car-sim.js'),stored(ROOT/'lab-service/public/games/play/car-sim.js'))
  for line in [l for l in git('grep','-n','-F','2.4.3.2','--','calendar-app','lab-service').decode().splitlines() if not l.startswith('calendar-app/releases/')]:
   self.assertNotRegex(line,r'\?v=2\.4\.3\.2|hubVersion|"version"|RELEASE=',line)
  self.assertIn("RELEASE='v2.4.3.3'",text(ROOT/'lab-service/academic.cjs'));self.assertEqual(json.loads(text(ROOT/'lab-service/public/academic/release.json'))['version'],'v2.4.3.3')
  for page in ['lab-service/public/games/index.html','lab-service/public/games/dream/index.html','lab-service/public/games/play/index.html']:
   self.assertNotIn('style=',text(ROOT/page));self.assertNotRegex(text(ROOT/page),r'<script>(?!</)')
   for ref in re.findall(r'(?:src|href)="(/[^"?]+\.(?:js|css))\?v=([\d.]+)"',text(ROOT/page)):self.assertEqual(ref[1],'2.4.3.3',page+' '+ref[0])
  page=text(ROOT/'lab-service/public/games/play/index.html')
  self.assertLess(page.index('/play/car-sim.js?v='),page.index('/play/car.js?v='))
  self.assertLess(page.index('/play/board.js?v='),min(page.index('/play/treasure.js?v='),page.index('/play/monopoly.js?v=')))
  for name in ['mmode','mminutes','mauction','mtrade']:self.assertIn('name="'+name+'"',page)
 def test_tycoon_entry_points(self):
  rooms=text(ROOT/'calendar-app/play-rooms.js');m=text(ROOT/'calendar-app/play-monopoly.js')
  self.assertIn("const plan = game.bot(room.state, seat, level, rng, {auto: !s.bot});",rooms)
  self.assertIn("ctx.bot = true; return g.act(state, seat, now.action, now.data, room.settings, ctx);",rooms)
  self.assertIn("GAMES[room.game].resume?.(room.state, {pausedFor});",rooms)
  for marker in ["function norm(state) { if (!state.fx) Object.assign(state, fresh('rounds', {}, 0)); return state; }",
                 "const ANSWERS = new Set(['acceptTrade', 'rejectTrade', 'counterTrade']);",
                 "state.why = ctx.bot ? cleanWhy(d.why, seat) : null;",
                 "if (opts.auto) return {action: 'rejectTrade', data: {why: {c: 'autoplay'}}};",
                 "if (opts.auto) return {action: 'fold', data: {why: {c: 'autoplay', t: i}}};",
                 "offer(state, tr.from, tr.to, tr);",
                 "const mode = input.mode ?? 'rounds', minutes = input.minutes ?? 60, auction = flag(input.auction ?? 0), trade = flag(input.trade ?? 0);"]:
   self.assertIn(marker,m)
  shown=m[m.index('function view(state)'):m.index('// ---- Computer player')]
  for secret in ['decks','memo','aim','anim']:self.assertNotIn(secret+':',shown.replace('s.trade.','x.'))
  self.assertIn('function tradeCard()',text(ROOT/'lab-service/public/games/play/monopoly.js'))
  self.assertIn('function speedControl()',text(ROOT/'lab-service/public/games/play/board.js'))
  self.assertIn('field.show && !field.show(view.settings)',text(ROOT/'lab-service/public/games/play/play.js'))
  self.assertEqual(git('diff','--name-only',BASE,'--','lab-service/games-host.cjs','calendar-app/play-treasure.js').decode().strip(),'')
  self.assertEqual(json.loads(text(ROOT/'calendar-app/package.json'))['dependencies'],json.loads(git('show',BASE+':calendar-app/package.json').decode())['dependencies'])
 def test_isolation_inputs(self):
  previous=json.loads((PRIOR/'release-config.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['isolation_checks'],previous['isolation_checks']+['tycoon-http.cjs'])
  self.assertEqual(CONFIG['test_inputs']['tycoon-http.cjs'],'scripts/releases/v2.4.3.3/tests/tycoon-http.cjs')
  self.assertEqual(CONFIG['test_inputs']['asset-checks.json'],'scripts/releases/v2.4.3.3/release-config.json')
  self.assertEqual({k:v for k,v in CONFIG['test_inputs'].items() if k not in ['tycoon-http.cjs','asset-checks.json']},{k:v for k,v in previous['test_inputs'].items() if k!='asset-checks.json'})
  for path in list(CONFIG['test_inputs'].values())+list(CONFIG['support_files'].values()):self.assertTrue((ROOT/path).is_file(),path)
  self.assertEqual(CONFIG['support_files']['prior_0432.py'],'scripts/releases/v2.4.3.2/deploy.py')
  suite=text(HERE/'tests/tycoon-http.cjs')
  for ip in ['192.0.2.232','192.0.2.233']:self.assertIn("'"+ip+"'",suite)
  for other in [p for p in CONFIG['test_inputs'].values() if p.endswith('.cjs') and 'tycoon-http' not in p]:
   for ip in ['192.0.2.232','192.0.2.233']:self.assertNotIn("'"+ip+"'",text(ROOT/other),other)
  self.assertEqual(git('diff','--name-only',BASE,'--','scripts/updater','scripts/releases/v2.4.3.2','scripts/releases/v2.4.3.1','scripts/releases/v2.4.3.0').decode().strip(),'')
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_caddy_is_only_read(self):
  deploy=self.load()
  self.assertEqual(sorted(deploy.runtime.HOOKS),['prepare']);self.assertIs(deploy.runtime.HOOKS['prepare'],deploy.prior.prior.prior.prepare)
  with tempfile.TemporaryDirectory() as tmp:
   backup=Path(tmp);base='garyhub.uk {\n    reverse_proxy garyhub-lab:3000\n}\n'
   (backup/'Caddyfile').write_text(base+'\n'+deploy.prior.prior.prior.prior.SITE_BLOCK)
   deploy.runtime.HOOKS['prepare']({},{},{},backup)
   (backup/'Caddyfile').write_text(base)
   with self.assertRaisesRegex(RuntimeError,'Nothing was changed'):deploy.runtime.HOOKS['prepare']({},{},{},backup)
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_deploy_reuses_prior_checks(self):
  deploy=self.load()
  self.assertIs(deploy.runtime.verify_https,deploy.verify);self.assertEqual(deploy.runtime.VERSION,'2.4.3.3');self.assertEqual(deploy.runtime.REQUIRES,'2.4.3.2')
  module=deploy.prior
  while module is not None:self.assertEqual(module.CONFIG['version'],'2.4.3.3');module=getattr(module,'prior',None)
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
  spec=importlib.util.spec_from_file_location('deploy_0433_under_test',HERE/'deploy.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
  return deploy
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('Tycoon now has trading with counter-offers, auctions and three ways to win at https://games.garyhub.uk/play/',s)
  for stale in ['Treasure Dash and Tycoon are open','Co-op Car is open','Live rooms are open at','GLM']:self.assertNotIn(stale,s)
  prior=(PRIOR/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig').replace('\r\n','\n')
  self.assertEqual(len(delta(prior,s.replace('\r\n','\n'))),2)
 def test_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.3.3.json').read_text(encoding='utf-8'));self.assertEqual(r['version'],'garyhub-2.4.3.3');self.assertEqual(r['date'],'2026-11-21')
  self.assertEqual([n['scope'] for n in r['notes']],['home'])
  for words in ['胜负方式','交易','还价','拍卖','动画速度','理由']:self.assertIn(words,r['notes'][0]['body'])
if __name__=='__main__':unittest.main()
