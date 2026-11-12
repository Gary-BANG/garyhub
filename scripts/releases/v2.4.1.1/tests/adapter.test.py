import difflib,hashlib,importlib.util,json,re,subprocess,unittest
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.1.1'
PRIOR=ROOT/'scripts/releases/v2.4.1.0'
CONFIG=json.loads((HERE/'release-config.json').read_text(encoding='utf-8'))
BASE=CONFIG['reviewed_base_commit']
git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT)
# Read what Git stores (the index): a CRLF checkout of an unchanged text file is not a different release.
stored=lambda path:git('show',':'+path.relative_to(ROOT).as_posix())
text=lambda path:stored(path).decode()
PANEL=ROOT/'lab-service/public/companion/panel.css'
# Class names KaTeX puts on its own markup (katex.min.js output). Panel rules must not reach them.
KATEX={'text','base','strut','vlist','vlist-t','vlist-t2','vlist-r','vlist-s','mord','mrel','mbin','mopen','mclose','mpunct',
 'minner','mop','mspace','msupsub','mfrac','sizing','reset-size','mathnormal','mathit','mathrm','mathbf','texttt','textrm',
 'textit','textbf','newline','tag','root','sqrt','accent','delimsizing','nulldelimiter','pstrut','hide-tail','overline',
 'underline','frac-line','svg-align','mtable','arraycolsep','fontsize-ensurer','katex','katex-html','katex-mathml','mathdefault'}
def local(a):
 base=ROOT/('calendar-app/public' if a['host']=='calendar.garyhub.uk' else 'lab-service/public')
 if a['host']=='sites.garyhub.uk':base=base/'sites'
 route=a['route']
 rel=('homepage.html' if a['host']=='garyhub.uk' else 'index.html') if route=='/' else route.lstrip('/')+'index.html' if route.endswith('/') else route.lstrip('/')
 return base/('admin.html' if rel=='admin/index.html' else rel)
def selectors(css):
 css=re.sub(r'/\*.*?\*/','',css,flags=re.S)
 for block in re.findall(r'([^{}]+)\{[^{}]*\}',re.sub(r'@media[^{]*\{','',css)):
  for sel in block.split(','):
   if sel.strip():yield ' '.join(sel.split())
delta=lambda a,b:[l for l in difflib.unified_diff(a.splitlines(),b.splitlines(),lineterm='',n=0) if l[:1] in '+-' and l[:3] not in ('+++','---')]
class ReleaseTests(unittest.TestCase):
 def test_manifest_and_strict_baseline(self):
  m=json.loads((ROOT/'releases/2.4.1.1.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['version'],'2.4.1.1');self.assertEqual(CONFIG['requires_release'],'2.4.1.0');self.assertEqual(m['requires_release'],'2.4.1.0')
  self.assertEqual(CONFIG['baseline_adapter'],'scripts/releases/v2.4.1.0')
  self.assertEqual(BASE,m['reviewed_base_commit']);self.assertEqual(BASE,'289662f545488cea0f52bf9c38a4948985978b88');self.assertFalse(m['production_verified'])
  # The reviewed base is the merged v2.4.1.0 (PR #43); its tree is the v2.4.1.0 release commit.
  self.assertEqual(git('rev-parse',BASE+'^{tree}'),git('rev-parse','94e451ccb01de6f4f7b8111d8b2154319e05eb10^{tree}'))
  self.assertEqual(CONFIG['installer_build'],'v2.4.1.1-r1');self.assertEqual(m['installer_revision'],'r1');self.assertNotIn('installed_baseline_tree',CONFIG)
  self.assertIn('companion_bubble_styles_do_not_reach_formula_markup',m['protections'])
  self.assertEqual(json.loads((ROOT/'releases/current.json').read_text())['manifest'],'releases/2.4.1.1.json')
 def test_only_the_fix_and_version_references_change(self):
  changed=[p for p in git('diff','--cached','--name-only',BASE,'--','calendar-app','lab-service').decode().split()] or \
          [p for p in git('diff','--name-only',BASE,'HEAD','--','calendar-app','lab-service').decode().split()]
  self.assertIn('lab-service/public/companion/panel.css',changed);self.assertIn('calendar-app/releases/garyhub-2.4.1.1.json',changed)
  for path in changed:
   if path.endswith('panel.css') or path=='calendar-app/releases/garyhub-2.4.1.1.json':continue
   with self.subTest(path=path):
    lines=delta(git('show',BASE+':'+path).decode(),text(ROOT/path))
    self.assertTrue(lines)
    for line in lines:self.assertIn('2.4.1.1' if line[0]=='+' else '2.4.1.0',line)
    self.assertEqual(text(ROOT/path).replace('2.4.1.1','2.4.1.0'),git('show',BASE+':'+path).decode())
 def test_runtime_and_asset_hashes(self):
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums']:
   for a in CONFIG[group]:
    with self.subTest(host=a['host'],route=a['route']):self.assertEqual(hashlib.sha256(stored(local(a))).hexdigest(),a['sha256'])
  panel={a['host'] for a in CONFIG['asset_checksums'] if a['route']=='/companion/panel.css'}
  self.assertEqual(panel,{'tools.garyhub.uk','garyhub.uk','calendar.garyhub.uk'})
  for name,expected in CONFIG['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256(stored(ROOT/'calendar-app/stocks'/name)).hexdigest(),expected)
 def test_shipped_files_keep_stored_line_endings(self):
  changed=[p for p in git('diff','--name-only',BASE,'--','calendar-app','lab-service').decode().split() if (ROOT/p).is_file()]
  self.assertIn('lab-service/public/companion/panel.css',changed)
  for path in changed+['scripts/releases/v2.4.1.1/variant-overrides/1.3.4.1/'+rel for rel in ['calendar-app/app.js','lab-service/server.cjs']]:
   with self.subTest(path=path):self.assertEqual((ROOT/path).read_bytes(),stored(ROOT/path))
 def test_capability_variant_matches_the_main_server_changes(self):
  # The 1.3.4.1 override differs from v2.4.1.0's only by the same edits made to the main files.
  for rel in ['calendar-app/app.js','lab-service/server.cjs']:
   main_before=git('show',BASE+':'+rel).decode();main_after=text(ROOT/rel)
   variant_before=git('show',BASE+':scripts/releases/v2.4.1.0/variant-overrides/1.3.4.1/'+rel).decode();variant_after=text(HERE/'variant-overrides/1.3.4.1'/rel)
   self.assertNotEqual(main_before,main_after)
   self.assertEqual(delta(main_before,main_after),delta(variant_before,variant_after),rel)
  self.assertIn('hubVersion:"2.4.1.1"',text(ROOT/'lab-service/server.cjs'));self.assertIn('hubVersion: "2.4.1.1"',text(ROOT/'calendar-app/app.js'))
 def test_companion_copies_and_one_asset_version(self):
  for name in ['knowledge.js','panel.js','panel.css','pet.js','boot.js']:
   self.assertEqual(stored(ROOT/'calendar-app/public/companion'/name),stored(ROOT/'lab-service/public/companion'/name))
  leftovers=[p for p in git('grep','-l','-F','2.4.1.0','--','calendar-app','lab-service').decode().split() if not p.startswith('calendar-app/releases/')]
  self.assertEqual(leftovers,['lab-service/homepage-privacy.cjs'])
  self.assertEqual([l for l in text(ROOT/'lab-service/homepage-privacy.cjs').splitlines() if '2.4.1.0' in l],
                   ['// Developer profile (v2.4.1.0): structured private content in developer-profile.json, outside public/.'])
  home=text(ROOT/'lab-service/public/homepage.html')
  self.assertIn('<script src="/companion/boot.js?v=2.4.1.1" defer data-companion="open"></script>',home)
  self.assertIn('<a href="https://sites.garyhub.uk/" target="_blank" rel="noopener"><strong>Elsewhere ↗</strong>',home)
 def test_bubble_rules_never_reach_formula_markup(self):
  css=text(PANEL)
  seen=0
  for sel in selectors(css):
   for i,m in enumerate(re.finditer(r'\.([A-Za-z][\w-]*)',sel)):
    name=m.group(1)
    if name=='text':
     seen+=1
     # Only the bubble element itself: the compound right after a child combinator from .msg.
     self.assertRegex(sel[:m.start()],r'\.msg(?:\.[\w-]+)*\s*>\s*$',sel)
    elif name in KATEX:
     self.assertEqual(name,'katex-display',sel)  # the one deliberate rule: wide display formulas scroll
  self.assertGreaterEqual(seen,9)
  self.assertIn('.tutoring .katex-display{max-width:100%;overflow-x:auto;overflow-y:hidden;padding:2px 0}',css)
  # panel.js puts every reply into one bubble element that is a direct child of .msg.
  js=text(ROOT/'lab-service/public/companion/panel.js')
  self.assertIn("const node = el('div', `msg ${who}`); node.append(el('div', 'text', text));",js)
  self.assertIn("node.querySelector('.text').innerHTML = DOMPurify.sanitize(marked.parse(data.reply)",js)
 def test_isolated_suites_expect_the_markup_this_release_ships(self):
  pages=[text(p) for folder in ['lab-service/public','calendar-app/public','calendar-app/stocks'] for p in sorted((ROOT/folder).rglob('*.html')) if 'vendor' not in p.parts]
  checked=0
  for name,path in CONFIG['test_inputs'].items():
   if not name.endswith('-http.cjs'):continue
   for literal in re.findall(r"\.includes\('(<[^'+]*>[^'+]*)'\)",text(ROOT/path)):
    with self.subTest(suite=name,literal=literal):self.assertTrue(any(literal in page for page in pages));checked+=1
  self.assertGreaterEqual(checked,1)
 def test_shared_runtime_and_isolation_inputs(self):
  self.assertEqual(CONFIG['isolation_checks'],json.loads((PRIOR/'release-config.json').read_text(encoding='utf-8'))['isolation_checks'])
  self.assertEqual(len(CONFIG['isolation_checks']),11)
  for path in list(CONFIG['test_inputs'].values())+list(CONFIG['support_files'].values()):self.assertTrue((ROOT/path).is_file(),path)
  self.assertEqual(CONFIG['test_inputs']['asset-checks.json'],'scripts/releases/v2.4.1.1/release-config.json')
  self.assertEqual(CONFIG['support_files'],{'prior_checks.py':'scripts/releases/v2.3.2.3/deploy.py','prior_0404.py':'scripts/releases/v2.4.0.4/deploy.py','prior_0410.py':'scripts/releases/v2.4.1.0/deploy.py'})
  self.assertIn('from build_overlay import build',(HERE/'build-package.py').read_text())
  self.assertEqual(git('diff','--name-only',BASE,'--','scripts/updater','scripts/releases/v2.4.0.4','scripts/releases/v2.4.1.0','scripts/releases/v2.3.2.3').decode().strip(),'')
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_deploy_reuses_prior_checks_without_the_private_profile_hook(self):
  spec=importlib.util.spec_from_file_location('deploy_0411_under_test',HERE/'deploy.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
  self.assertIs(deploy.runtime.verify_https,deploy.verify);self.assertNotIn('prepare',deploy.runtime.HOOKS)
  self.assertIs(deploy.runtime.run,deploy.prior.prior.checked_run);self.assertEqual(deploy.runtime.VERSION,'2.4.1.1');self.assertEqual(deploy.runtime.REQUIRES,'2.4.1.0')
  for module in [deploy.checks,deploy.prior,deploy.prior.prior]:self.assertEqual(module.CONFIG['version'],'2.4.1.1')
  calls=[];fixed=text(PANEL);stale=git('show',BASE+':lab-service/public/companion/panel.css').decode()
  class Done:returncode=0
  deploy.prior.verify=lambda:calls.append('prior')
  deploy.runtime.run=lambda args,check=True:(calls.append(args[2]),Done())[1]
  deploy.runtime.https=lambda host,route:(calls.append(host+route),fixed.encode())[1]
  deploy.verify()
  self.assertEqual(calls[0],'prior');self.assertIn('garyhub.uk/companion/panel.css?v=2.4.1.1',calls);self.assertIn('calendar-app',calls);self.assertIn('garyhub-lab',calls)
  deploy.runtime.https=lambda host,route:stale.encode()
  with self.assertRaisesRegex(RuntimeError,'still match formula text'):deploy.verify()
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('Formulas in Study Q&A replies render on one line again; wide ones scroll sideways.',s)
  for stale in ['starfield','developer profile','Study Q&A consent','Multi-line','A-share','VIP','GLM']:self.assertNotIn(stale,s)
  self.assertIn('-PrepareOnly',s);self.assertIn('preserving all current records',s)
  prior=(PRIOR/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig').replace('\r\n','\n')
  self.assertEqual(len(delta(prior,s.replace('\r\n','\n'))),2)  # only the COMPLETE line differs
 def test_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.1.1.json').read_text(encoding='utf-8'));self.assertEqual(r['version'],'garyhub-2.4.1.1');self.assertEqual(r['date'],'2026-11-12')
  self.assertEqual([n['scope'] for n in r['notes']],['tools'])
  self.assertTrue(all(n['title'] and n['body'] for n in r['notes']))
if __name__=='__main__':unittest.main()
