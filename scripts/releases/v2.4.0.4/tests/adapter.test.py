import hashlib,importlib.util,json,re,subprocess,types,unittest
from pathlib import Path
try:import fcntl
except ImportError:fcntl=None
ROOT=Path(__file__).resolve().parents[4]
HERE=ROOT/'scripts/releases/v2.4.0.4'
CONFIG=json.loads((HERE/'release-config.json').read_text(encoding='utf-8'))
BASE=CONFIG['reviewed_base_commit']
git=lambda *args:subprocess.check_output(['git',*args],cwd=ROOT)
# Read what Git stores (the index): a CRLF checkout of an unchanged text file is not a different release.
stored=lambda path:git('show',':'+path.relative_to(ROOT).as_posix())
text=lambda path:stored(path).decode()
class ReleaseTests(unittest.TestCase):
 def test_manifest_and_strict_baseline(self):
  m=json.loads((ROOT/'releases/2.4.0.4.json').read_text(encoding='utf-8'))
  self.assertEqual(CONFIG['requires_release'],'2.4.0.3');self.assertEqual(CONFIG['baseline_adapter'],'scripts/releases/v2.4.0.3')
  self.assertEqual(BASE,m['reviewed_base_commit']);self.assertFalse(m['production_verified'])
  self.assertEqual(CONFIG['installer_build'],'v2.4.0.4-r2');self.assertEqual(m['installer_revision'],'r2');self.assertNotIn('installed_baseline_tree',CONFIG)
  self.assertEqual(json.loads((ROOT/'releases/current.json').read_text())['manifest'],'releases/2.4.0.4.json')
 def test_runtime_and_asset_hashes(self):
  for group in ['asset_checksums','protected_asset_checksums','admin_asset_checksums','sites_asset_checksums']:
   for a in CONFIG[group]:
    with self.subTest(host=a['host'],route=a['route']):
     root=ROOT/('calendar-app/public' if a['host']=='calendar.garyhub.uk' else 'lab-service/public')
     if a['host']=='sites.garyhub.uk':root=root/'sites'
     rel=('homepage.html' if a['host']=='garyhub.uk' else 'index.html') if a['route']=='/' else a['route'].lstrip('/')
     if rel=='admin/index.html':rel='admin.html'
     self.assertEqual(hashlib.sha256(stored(root/rel)).hexdigest(),a['sha256'])
  for name,expected in CONFIG['stock_asset_sha256'].items():self.assertEqual(hashlib.sha256(stored(ROOT/'calendar-app/stocks'/name)).hexdigest(),expected)
 def test_shipped_files_keep_stored_line_endings(self):
  # The package takes changed files from the working tree, so they must be the bytes Git stores.
  changed=[p for p in git('diff','--name-only',BASE,'--','calendar-app','lab-service').decode().split() if (ROOT/p).is_file()]
  self.assertIn('calendar-app/assistant-tutor.js',changed)
  for path in changed+['scripts/releases/v2.4.0.4/variant-overrides/1.3.4.1/'+rel for rel in ['calendar-app/app.js','lab-service/server.cjs']]:
   with self.subTest(path=path):self.assertEqual((ROOT/path).read_bytes(),stored(ROOT/path))
 def test_capability_variants_only_change_health_version(self):
  for rel in ['calendar-app/app.js','lab-service/server.cjs']:
   for prefix in ['',CONFIG['baseline_adapter']+'/variant-overrides/1.3.4.1/']:
    before=git('show',BASE+':'+prefix+rel).decode()
    expected=before.replace('hubVersion: "2.4.0.3"','hubVersion: "2.4.0.4"').replace('hubVersion:"2.4.0.3"','hubVersion:"2.4.0.4"')
    self.assertNotEqual(before,expected)
    self.assertEqual(expected,text(HERE/'variant-overrides/1.3.4.1'/rel if prefix else ROOT/rel))
 def test_calendar_companion_copy_and_one_asset_version(self):
  for name in ['panel.js','panel.css','pet.js']:
   self.assertEqual(stored(ROOT/'calendar-app/public/companion'/name),stored(ROOT/'lab-service/public/companion'/name))
  leftovers=[p for p in git('grep','-l','-F','2.4.0.3','--','calendar-app','lab-service').decode().split() if not p.startswith('calendar-app/releases/')]
  self.assertEqual(leftovers,[])
 def test_sliding_consent(self):
  tutor=text(ROOT/'calendar-app/assistant-tutor.js');panel=text(ROOT/'lab-service/public/companion/panel.js')
  self.assertIn('TTL = 60 * 60_000',tutor)
  # Renewal sits after the token, session, expiry, fingerprint and busy checks, so an expired grant is never revived.
  chat=tutor[tutor.index("app.post('/api/assistant/tutor/chat'"):]
  renew=chat.index('grant.busy = true; grant.expires = Date.now() + TTL;')
  for guard in ['grant = current(req, userId)','grant.fingerprint','if (grant.busy)',"fail('问题需为 1–4,000 字符')"]:self.assertLess(chat.index(guard),renew,guard)
  self.assertIn('res.json({reply, expiresAt:grant.expires,',tutor)
  self.assertEqual(tutor.count('grant.expires = Date.now() + TTL'),1)
  self.assertIn('function armTutor(grant, at)',panel);self.assertIn('armTutor(grant, Date.now() + grant.ttl);',panel)
  self.assertIn('if (Number.isFinite(data.expiresAt)) armTutor(grant, data.expiresAt);',panel)
  self.assertIn('每次提问都会从提问时起续期一小时',panel);self.assertIn('each question extends it to one hour from then',panel)
  self.assertNotIn('一小时后过期清理；',panel);self.assertNotIn('This session expires after one hour',panel)
  unit=text(ROOT/'calendar-app/test/assistant-tutor.test.js');self.assertIn("'renewed past the original hour'",unit);self.assertIn("'idle for an hour'",unit)
  # The v2.4.0.3 waits are unchanged.
  self.assertIn('deadline:Date.now() + 140000',tutor);self.assertIn("verb==='chat'?160000:10000",text(ROOT/'lab-service/academic.cjs'))
 def test_isolated_suites_expect_the_markup_this_release_ships(self):
  pages=[text(p) for folder in ['lab-service/public','calendar-app/public','calendar-app/stocks'] for p in sorted((ROOT/folder).rglob('*.html')) if 'vendor' not in p.parts]
  checked=0
  for name,path in CONFIG['test_inputs'].items():
   if not name.endswith('-http.cjs'):continue
   for literal in re.findall(r"\.includes\('(<[^'+]*>[^'+]*)'\)",text(ROOT/path)):
    with self.subTest(suite=name,literal=literal):self.assertTrue(any(literal in page for page in pages));checked+=1
  self.assertGreaterEqual(checked,1)
  self.assertEqual(CONFIG['test_inputs']['sites-http.cjs'],'scripts/releases/v2.4.0.3/tests/sites-http.cjs')
 def test_shared_runtime_and_isolation_inputs(self):
  self.assertEqual(len(CONFIG['isolation_checks']),10)
  for path in list(CONFIG['test_inputs'].values())+list(CONFIG['support_files'].values()):self.assertTrue((ROOT/path).is_file())
  self.assertEqual(CONFIG['test_inputs']['asset-checks.json'],'scripts/releases/v2.4.0.4/release-config.json')
  self.assertIn('from build_overlay import build',(HERE/'build-package.py').read_text())
  deploy=(HERE/'deploy.py').read_text()
  self.assertIn('runtime.configure(ROOT, CONFIG)',deploy)
  for needle in ['grant.busy = true; grant.expires = Date.now() + TTL;','function armTutor(grant, at)',"verb==='chat'?160000:10000"]:self.assertIn(needle,deploy)
  self.assertNotIn('host_hooks',CONFIG)
  self.assertEqual(git('diff','--name-only',BASE,'--','scripts/updater').decode().strip(),'')
 @unittest.skipUnless(fcntl,'deploy_runtime.py needs Linux')
 def test_phase_six_curl_retries_and_names_the_request(self):
  spec=importlib.util.spec_from_file_location('deploy_0404_under_test',HERE/'deploy.py');deploy=importlib.util.module_from_spec(spec);spec.loader.exec_module(deploy)
  self.assertIs(deploy.runtime.run,deploy.checked_run);self.assertIs(deploy.checks.d,deploy.runtime);self.assertIs(deploy.runtime.verify_https,deploy.verify)
  deploy.CURL_PAUSE=0;calls=[]
  def fake(results):
   queue=list(results)
   def shared(args,check=True):
    calls.append([str(a) for a in args]);code,err,out=queue.pop(0)
    return types.SimpleNamespace(returncode=code,stderr=err,stdout=out)
   return shared
  # A timeout right after the switch, then success: retried and returned, through the shared https().
  deploy._shared_run=fake([(28,b'curl: (28) Operation timed out',b''),(0,b'',b'<html>')]);calls.clear()
  self.assertEqual(deploy.runtime.https('tools.garyhub.uk','/companion/panel.js?v=2.4.0.4'),b'<html>');self.assertEqual(len(calls),2)
  self.assertIn('--fail',calls[0])
  # Prior checks call d.run for status codes; a passing curl is returned untouched.
  deploy._shared_run=fake([(0,b'',b'401')]);calls.clear();self.assertEqual(deploy.checks.status('calendar.garyhub.uk','/api/stocks/status'),b'401');self.assertEqual(len(calls),1)
  # A 404 is a real failure: no retry, and the message names host and path without the query.
  deploy._shared_run=fake([(22,b'curl: (22) The requested URL returned error: 404',b'')]);calls.clear()
  with self.assertRaises(RuntimeError) as caught:deploy.runtime.https('garyhub.uk','/companion/pet.js?v=2.4.0.4&secret=x')
  self.assertEqual(str(caught.exception),'HTTPS check failed: https://garyhub.uk/companion/pet.js (curl exit 22, HTTP 404, 1 attempt)');self.assertEqual(len(calls),1)
  # A persistent 503 is retried four times, then reported.
  deploy._shared_run=fake([(22,b'curl: (22) The requested URL returned error: 503',b'')]*4);calls.clear()
  with self.assertRaises(RuntimeError) as caught:deploy.runtime.https('calendar.garyhub.uk','/privacy-ledger-release.json')
  self.assertIn('(curl exit 22, HTTP 503, 4 attempts)',str(caught.exception));self.assertEqual(len(calls),4)
  # check=False callers still get the result back; other commands pass straight through.
  deploy._shared_run=fake([(7,b'',b'')]*4);calls.clear();self.assertEqual(deploy.runtime.run(['curl','https://tools.garyhub.uk/'],False).returncode,7)
  deploy._shared_run=fake([(1,b'',b'')]);calls.clear();self.assertEqual(deploy.runtime.run(['docker','ps'],False).returncode,1);self.assertEqual(len(calls),1)
 def test_installer_version_placeholders_and_completion(self):
  s=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig')
  for key in ['RELEASE_VERSION','REQUIRES_VERSION','PACKAGE_SHA256','INSTALLER_BUILD_ID']:self.assertIn(key,s)
  self.assertIn('Study Q&A consent now renews for an hour with each question.',s)
  for stale in ['Multi-line','A-share','VIP','GLM']:self.assertNotIn(stale,s)
  self.assertIn('-PrepareOnly',s);self.assertIn('preserving all current records',s)
 def test_scoped_release_notice(self):
  r=json.loads((ROOT/'calendar-app/releases/garyhub-2.4.0.4.json').read_text(encoding='utf-8'));self.assertEqual(r['version'],'garyhub-2.4.0.4');self.assertEqual(r['date'],'2026-11-10')
  self.assertEqual([n['scope'] for n in r['notes']],['tools'])
  self.assertTrue(all(n['title'] and n['body'] for n in r['notes']))
if __name__=='__main__':unittest.main()
