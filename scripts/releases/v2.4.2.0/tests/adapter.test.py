import difflib,hashlib,importlib.util,json,re,subprocess,tempfile,unittest
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.2.0'
PRIOR=ROOT/'scripts/releases/v2.4.1.6'
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
  m=json.loads((ROOT/'releases/2.4.2.0.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['version'],'2.4.2.0');self.assertEqual(CONFIG['requires_release'],'2.4.1.6');self.assertEqual(m['requires_release'],'2.4.1.6')
  self.assertEqual(CONFIG['baseline_adapter'],'scripts/releases/v2.4.1.6')
  self.assertEqual(BASE,m['reviewed_base_commit']);self.assertEqual(BASE,'ca696d2ae307e5351821687155309c528963a560');self.assertFalse(m['production_verified'])
  self.assertIn("BASE='"+BASE+"'",(HERE/'build-package.py').read_text())
  # The reviewed base is the merged v2.4.1.6 (PR #49); its tree is the v2.4.1.6 release commit.
  self.assertEqual(git('rev-parse',BASE+'^{tree}'),git('rev-parse','a05f41c^{tree}'))
  self.assertEqual(CONFIG['installer_build'],'v2.4.2.0-r1');self.assertEqual(m['installer_revision'],'r1')
  previous=json.loads((ROOT/'releases/2.4.1.6.json').read_text(encoding='utf-8'))['protections']
  self.assertEqual(m['protections'][:len(previous)],previous)
  for protection in ['games_host_dns_checked_and_caddy_validated_before_change','games_caddy_restored_on_rollback','game_boxes_hidden_until_opened','game_order_committed_and_published_at_end']:
   self.assertIn(protection,m['protections'])
  self.assertEqual(json.loads((ROOT/'releases/current.json').read_text())['manifest'],'releases/2.4.2.0.json')
 def test_runtime_and_asset_hashes(self):
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums','games_asset_checksums']:
   for a in CONFIG[group]:
    with self.subTest(host=a['host'],route=a['route']):self.assertEqual(hashlib.sha256(stored(local(a))).hexdigest(),a['sha256'])
  for a in CONFIG['games_page_checksums']:
   self.assertEqual(a['file'],'/lab/public/games'+a['route']);self.assertEqual(hashlib.sha256(stored(container(a['file']))).hexdigest(),a['sha256'])
  self.assertEqual([a['route'] for a in CONFIG['games_page_checksums']],['/index.html','/dream/index.html'])
  for name,expected in CONFIG['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256(stored(ROOT/'calendar-app/stocks'/name)).hexdigest(),expected)
  public={(a['host'],a['route']) for a in CONFIG['asset_checksums']}
  for host,route in [('garyhub.uk','/'),('tools.garyhub.uk','/hub-search.js'),('calendar.garyhub.uk','/hub-search.js'),('tools.garyhub.uk','/companion/knowledge.js'),
                     ('calendar.garyhub.uk','/sw.js'),('tools.garyhub.uk','/auth-redirect.js'),('calendar.garyhub.uk','/auth-redirect.js'),('garyhub.uk','/i18n/dictionary.js')]:
   self.assertIn((host,route),public)
 def test_shipped_files_keep_stored_line_endings(self):
  changed=[p for p in git('diff','--name-only',BASE,'--','calendar-app','lab-service').decode().split() if (ROOT/p).is_file()]
  for required in ['calendar-app/games-api.js','lab-service/games-host.cjs','lab-service/public/games/dream/dream.js','calendar-app/releases/garyhub-2.4.2.0.json']:self.assertIn(required,changed)
  for path in changed+['scripts/releases/v2.4.2.0/variant-overrides/1.3.4.1/'+rel for rel in ['calendar-app/app.js','lab-service/server.cjs']]:
   with self.subTest(path=path):self.assertEqual((ROOT/path).read_bytes(),stored(ROOT/path))
 def test_capability_variant_matches_the_main_change(self):
  for rel,size in [('calendar-app/app.js',4),('lab-service/server.cjs',8)]:
   main=strip(delta(git('show',BASE+':'+rel).decode(),text(ROOT/rel)))
   variant=strip(delta(git('show',BASE+':scripts/releases/v2.4.1.6/variant-overrides/1.3.4.1/'+rel).decode(),text(HERE/'variant-overrides/1.3.4.1'/rel)))
   self.assertEqual(main,variant,rel);self.assertEqual(len(main),size,rel)
  server=text(ROOT/'lab-service/server.cjs')
  # Earlier adapters look for these texts; the games routes come after them.
  self.assertIn('me|preferences|notifications(?:',server);self.assertIn('|notify(?:\\/devices\\/\\d+\\/remove|\\/feed)?|games(?:',server)
  self.assertIn("'https://games.garyhub.uk']);",server);self.assertIn('if(await games(req,res,url,host))return;',server)
  self.assertIn('hubVersion:"2.4.2.0"',server);self.assertIn('hubVersion: "2.4.2.0"',text(ROOT/'calendar-app/app.js'))
  # The games origin is one explicit entry added to whatever TRUSTED_ORIGINS lists; no wildcard.
  app=text(ROOT/'calendar-app/app.js');self.assertIn(',"https://games.garyhub.uk"]);',app);self.assertNotIn('*.garyhub.uk',app)
 def test_shared_copies_and_one_asset_version(self):
  for name in SHARED:
   with self.subTest(name=name):self.assertEqual(stored(ROOT/'calendar-app/public'/name),stored(ROOT/'lab-service/public'/name))
  for name in ['knowledge.js','panel.js','panel.css','pet.js','boot.js']:
   self.assertEqual(stored(ROOT/'calendar-app/public/companion'/name),stored(ROOT/'lab-service/public/companion'/name))
  # Only comments that record when a feature arrived (and earlier test data) may still name v2.4.1.6.
  for line in [l for l in git('grep','-n','-F','2.4.1.6','--','calendar-app','lab-service').decode().splitlines() if not l.startswith('calendar-app/releases/')]:
   self.assertNotRegex(line,r'\?v=2\.4\.1\.6|hubVersion|"version"|RELEASE=',line)
  # The Study Hub reports the release it runs in (checked by study-http.cjs), so its marker moves with the app.
  self.assertIn("RELEASE='v2.4.2.0'",text(ROOT/'lab-service/academic.cjs'));self.assertEqual(json.loads(text(ROOT/'lab-service/public/academic/release.json'))['version'],'v2.4.2.0')
  for page in ['lab-service/public/games/index.html','lab-service/public/games/dream/index.html']:
   self.assertNotIn('style=',text(ROOT/page));self.assertNotRegex(text(ROOT/page),r'<script>(?!</)')
 def test_game_rules_and_entry_points(self):
  api=text(ROOT/'calendar-app/games-api.js')
  for marker in ["MIN_PRIZES = 10, MAX_PRIZES = 20","crypto.randomInt(i + 1)","WHERE id=? AND revision=?","reveal: finished ? {salt: game.salt","'notify_deliveries','dream_games'"]:
   self.assertIn(marker,api+text(ROOT/'calendar-app/account-admin.js'))
  self.assertNotIn('REFERENCES users',api)
  host=text(ROOT/'lab-service/games-host.cjs')
  self.assertIn("default-src 'none'; script-src 'self'; style-src 'self'",host)
  # Every move the page sends is one the Lab proxy and the games host pass on.
  moves=re.findall(r"^  (\w+): \{status:",api,re.M)
  self.assertEqual(sorted(moves),sorted(['decline','cancel','choose','open','offer','answer','reveal','honor']))
  for route in [text(ROOT/'lab-service/server.cjs'),host]:self.assertIn('(?:'+'|'.join(moves)+')',route)
  self.assertIn('<a href="https://games.garyhub.uk/"><strong>Games</strong>',text(ROOT/'lab-service/public/homepage.html'))
  self.assertIn("url: 'https://games.garyhub.uk/'",text(ROOT/'lab-service/public/hub-search.js'))
  self.assertIn("{id:'games', url:'https://games.garyhub.uk/', access:'login'",text(ROOT/'lab-service/public/companion/knowledge.js'))
 def test_isolation_inputs(self):
  previous=json.loads((PRIOR/'release-config.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['isolation_checks'],previous['isolation_checks']+['games-http.cjs'])
  self.assertEqual(CONFIG['test_inputs']['games-http.cjs'],'scripts/releases/v2.4.2.0/tests/games-http.cjs')
  self.assertEqual(CONFIG['test_inputs']['asset-checks.json'],'scripts/releases/v2.4.2.0/release-config.json')
  self.assertEqual({k:v for k,v in CONFIG['test_inputs'].items() if k not in ['games-http.cjs','asset-checks.json']},{k:v for k,v in previous['test_inputs'].items() if k!='asset-checks.json'})
  for path in list(CONFIG['test_inputs'].values())+list(CONFIG['support_files'].values()):self.assertTrue((ROOT/path).is_file(),path)
  self.assertEqual(CONFIG['support_files']['prior_0416.py'],'scripts/releases/v2.4.1.6/deploy.py')
  # The new suite has its own login addresses.
  suite=text(HERE/'tests/games-http.cjs')
  for ip in ['192.0.2.221','192.0.2.222','192.0.2.223']:self.assertIn("'"+ip+"'",suite)
  for other in [p for p in CONFIG['test_inputs'].values() if p.endswith('.cjs') and 'games-http' not in p]:
   for ip in ['192.0.2.221','192.0.2.222','192.0.2.223']:self.assertNotIn("'"+ip+"'",text(ROOT/other),other)
  self.assertEqual(git('diff','--name-only',BASE,'--','scripts/updater','scripts/releases/v2.1.0.0','scripts/releases/v2.3.2.3','scripts/releases/v2.4.0.4','scripts/releases/v2.4.1.0',
   'scripts/releases/v2.4.1.1','scripts/releases/v2.4.1.2','scripts/releases/v2.4.1.3','scripts/releases/v2.4.1.4','scripts/releases/v2.4.1.5','scripts/releases/v2.4.1.6').decode().strip(),'')
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_caddy_dns_prepare_apply_rollback(self):
  deploy=self.load()
  base='garyhub.uk {\n    reverse_proxy garyhub-lab:3000\n}\n'
  added=deploy.caddy_with_site(base)
  self.assertTrue(added.endswith('\n\n'+deploy.SITE_BLOCK));self.assertEqual(deploy.caddy_with_site(added),added)
  with self.assertRaisesRegex(RuntimeError,'differently'):deploy.caddy_with_site(base+'games.garyhub.uk {\n    respond "x"\n}\n')
  self.assertEqual(deploy.caddy_with_site(base+'# games.garyhub.uk was here\n').count('games.garyhub.uk {'),1)
  deploy.addresses=lambda name:set() if name=='games.garyhub.uk' else {'203.0.113.5'}
  deploy.local_addresses=lambda:set()
  with self.assertRaisesRegex(RuntimeError,'A record named "games".*Nothing was changed'):deploy.check_dns()
  deploy.addresses=lambda name:{'198.51.100.9'} if name=='games.garyhub.uk' else {'203.0.113.5'}
  with self.assertRaisesRegex(RuntimeError,'points to 198.51.100.9'):deploy.check_dns()
  deploy.addresses=lambda name:{'203.0.113.5'}
  deploy.check_dns()
  with tempfile.TemporaryDirectory() as tmp:
   backup=Path(tmp);live=backup/'live-Caddyfile';live.write_text(base);(backup/'Caddyfile').write_text(base)
   runs=[];deploy.runtime.run=lambda args,check=True:runs.append(args) or type('R',(),{'returncode':0,'stdout':b''})()
   written=[];deploy.runtime.set_caddy=lambda path,value:(Path(path).write_text(value),written.append(value))
   deploy.runtime.STATE=backup/'state.json'
   s={'backup':str(backup),'caddy_path':str(live)}
   deploy.prepare(s,{},{},backup)
   self.assertTrue(any('validate' in a for a in runs));self.assertFalse(s['games_caddy']['applied']);self.assertEqual(live.read_text(),base)
   deploy.apply(s)
   self.assertIn(deploy.SITE_BLOCK,live.read_text());self.assertEqual(s['managed_caddy_sha'],deploy.runtime.sha(live))
   deploy.rollback(s,True)
   self.assertEqual(live.read_text(),base);self.assertFalse(s['games_caddy']['applied'])
   # Someone else changed Caddy after the release: rollback stops instead of overwriting their change.
   deploy.apply(s);live.write_text(live.read_text()+'\nother.example {\n}\n')
   with self.assertRaisesRegex(RuntimeError,'Caddy changed after this release'):deploy.rollback(s,True)
   s2={'backup':str(backup),'caddy_path':str(live)};deploy.rollback(s2,False)  # never applied: nothing to undo
  self.assertEqual(sorted(k for k in deploy.runtime.HOOKS if k in ['prepare','apply','rollback']),['apply','prepare','rollback'])
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_deploy_reuses_prior_checks(self):
  deploy=self.load()
  self.assertIs(deploy.runtime.verify_https,deploy.verify);self.assertEqual(deploy.runtime.VERSION,'2.4.2.0');self.assertEqual(deploy.runtime.REQUIRES,'2.4.1.6')
  module=deploy.prior
  while module is not None:self.assertEqual(module.CONFIG['version'],'2.4.2.0');module=getattr(module,'prior',None)
  # Every running-container marker of this and the earlier v2.4.1.x adapters is still in the files shipped now.
  module=deploy
  while module is not None:
   for service,expected in getattr(module,'RUNNING',{}).items():
    for path,marker in expected.items():
     with self.subTest(adapter=module.__name__,path=path):self.assertIn(marker,text(container(path)))
   module=getattr(module,'prior',None)
  calls=[];games_assets={a['route']:a for a in CONFIG['games_asset_checksums']}
  class Done:returncode=0;stdout=b'302'
  class Failed:returncode=1;stdout=b''
  deploy.prior.verify=lambda:calls.append('older')
  deploy.checks.protected_asset=lambda asset:calls.append('page '+asset['route'])
  deploy.checks.curl_headers=lambda host,route:"HTTP/2 200\r\ncontent-security-policy: default-src 'none'; script-src 'self'\r\n"
  def status(host,route,method='GET'):
   if route=='/api/hub/games':return b'403' if method=='POST' else b'401'
   return b'404'
  deploy.checks.status=status
  deploy.runtime.run=lambda args,check=True:(calls.append(args[2] if args[0]=='docker' else 'curl'),Done())[1]
  home=b'<a href="https://games.garyhub.uk/"><strong>Games</strong>'
  pages={r:(local({'host':'games.garyhub.uk','route':r}).read_bytes().replace(b'\r\n',b'\n')) for r in games_assets}
  deploy.runtime.https=lambda host,route:home if host=='garyhub.uk' else pages[route.split('?')[0]]
  deploy.verify()
  self.assertEqual(calls[0],'curl');self.assertEqual(calls[1],'older');self.assertIn('page /dream/index.html',calls)
  self.assertEqual(calls.count('calendar-app'),2);self.assertEqual(calls.count('garyhub-lab'),1)
  deploy.runtime.https=lambda host,route:home if host=='garyhub.uk' else b'old'
  with self.assertRaisesRegex(RuntimeError,'Release asset mismatch'):deploy.verify()
  deploy.runtime.https=lambda host,route:home if host=='garyhub.uk' else pages[route.split('?')[0]]
  deploy.checks.status=lambda host,route,method='GET':b'200'
  with self.assertRaisesRegex(RuntimeError,'exposes another file'):deploy.verify()
  deploy.checks.status=status
  deploy.runtime.run=lambda args,check=True:Failed() if 'sqlite_master' in args[-1] else Done()
  with self.assertRaisesRegex(RuntimeError,'Games table'):deploy.verify()
 def load(self):
  spec=importlib.util.spec_from_file_location('deploy_0420_under_test',HERE/'deploy.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
  return deploy
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('Games is live at https://games.garyhub.uk/ with Daydreamer',s)
  for stale in ['Settings now arrange','accent colour, density','GLM']:self.assertNotIn(stale,s)
  prior=(PRIOR/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig').replace('\r\n','\n')
  self.assertEqual(len(delta(prior,s.replace('\r\n','\n'))),2)
 def test_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.2.0.json').read_text(encoding='utf-8'));self.assertEqual(r['version'],'garyhub-2.4.2.0');self.assertEqual(r['date'],'2026-11-20')
  self.assertEqual([n['scope'] for n in r['notes']],['home'])
  self.assertTrue(all(n['title'] and n['body'] for n in r['notes']))
  self.assertIn('不处理任何付款',r['notes'][0]['body'])
if __name__=='__main__':unittest.main()
