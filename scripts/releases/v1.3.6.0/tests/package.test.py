from pathlib import Path
import base64,hashlib,io,json,sys,unittest,zipfile
PACKAGE=Path(sys.argv.pop(1)).resolve()if len(sys.argv)>1 else None
class PackageTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  if PACKAGE is None:raise unittest.SkipTest('Pass the built update ZIP')
  cls.outer=zipfile.ZipFile(PACKAGE);cls.prefix=next(n.rsplit('/',1)[0]for n in cls.outer.namelist()if n.endswith('/payload.zip'));cls.payload=cls.outer.read(cls.prefix+'/payload.zip');cls.inner=zipfile.ZipFile(io.BytesIO(cls.payload));cls.manifest=json.loads(cls.inner.read('manifest.json'))
 def test_every_payload_file_is_exactly_bound_by_the_manifest(self):
  self.assertEqual(set(self.inner.namelist()),set(self.manifest['files'])|{'manifest.json'})
  for name,expected in self.manifest['files'].items():self.assertEqual(hashlib.sha256(self.inner.read(name)).hexdigest(),expected,name)
 def test_windows_bootstrap_hash_host_key_and_python_syntax(self):
  script=self.outer.read(self.prefix+'/Install-GaryHub.ps1').decode('utf-8-sig');self.assertIn(hashlib.sha256(self.payload).hexdigest(),script);self.assertNotIn('PACKAGE_SHA256',script);self.assertNotIn('INSTALLER_BUILD_ID',script);self.assertIn('StrictHostKeyChecking=yes',script)
  bootstrap=script.split("$bootstrap=@'",1)[1].split("'@",1)[0].replace('PAYLOAD_BASE64',base64.b64encode(self.payload).decode()).replace('ROLLBACK_FLAG','False');compile(bootstrap,'ssh-bootstrap','exec')
  for name in self.outer.namelist():
   if name.endswith('.cmd'):self.assertNotIn(b'\n',self.outer.read(name).replace(b'\r\n',b''))
 def test_both_variants_extend_the_merged_v1354_without_changing_dependencies(self):
  self.assertEqual(set(self.manifest['variants']),{'1.3.4.1','1.3.4.2'});self.assertEqual(self.manifest['requires_release'],'1.3.5.4')
  self.assertEqual(self.manifest['base_commit'],'2e86e2d7b349997f5b5716cb45335e39088d295a')
  for variant in self.manifest['variants']:
   prefix='payload/'+variant+'/'
   for rel in ['lab-service/lab-distribution.cjs','lab-service/public/lab/distribution.js','lab-service/public/lab/pack-validation.mjs','lab-service/public/useful/image-eraser/index.html','lab-service/public/useful/markdown-viewer/index.html','lab-service/public/useful/pdf-gray/app.js','calendar-app/releases/garyhub-1.3.6.0.json']:
    self.assertIn(prefix+rel,self.inner.namelist())
   for rel in ['calendar-app/account-admin.js','calendar-app/fixed-expenses.js','calendar-app/ledger-api.js','calendar-app/db.js','calendar-app/package.json','calendar-app/package-lock.json']:
    self.assertNotIn(prefix+rel,self.inner.namelist(),'unchanged code and dependencies must be inherited')
   app=self.inner.read(prefix+'calendar-app/app.js').decode();self.assertIn('1.3.6.0',app);self.assertEqual('registerTotp(app' in app,variant=='1.3.4.2')
   self.assertIn('TodoImportError',app)
   catalog=self.inner.read(prefix+'lab-service/public/index.html').decode();self.assertEqual('href="/totp/"' in catalog,variant=='1.3.4.2');self.assertEqual(catalog.count('href="/useful/'),3)
   self.assertNotIn(prefix+'lab-service/Dockerfile',self.inner.namelist())
   self.assertIn('source/'+variant+'/lab-service/Dockerfile',self.inner.namelist())
   for name in ['build-package.py','sync-source.ps1','Push-GitHub.ps1']:
    self.assertIn('source/'+variant+'/scripts/releases/v1.3.6.0/'+name,self.inner.namelist())
 def test_installer_checks_the_actual_v1354_base_and_runs_import_checks_before_cutover(self):
  code=self.inner.read('deploy.py').decode()
  self.assertIn("next(iter(versions.values()))!='1.3.5.4'",code)
  self.assertIn(".version!=='1.3.5.4'",code)
  self.assertIn("'todo-import.cjs'",code);self.assertIn("'/app/test/todo-import.test.js'",code)
  self.assertLess(code.index("'todo-import.cjs'"),code.index("say('5/8"))
  self.assertIn("'lab_distribution_release'",code);self.assertIn("'lab-distribution.cjs'",code)
 def test_runtime_payloads_exclude_user_data_and_unrelated_lab_runtime(self):
  for name in self.inner.namelist():
   self.assertNotIn('/node_modules/',name)
   self.assertFalse(any(p.lower().startswith('.env') and p.lower()!='.env.example' for p in Path(name).parts),name)
   if name.startswith('payload/'):
    self.assertNotIn('homepage-protected.json',name);self.assertNotIn('profile-private.json',name);self.assertFalse(name.endswith(('.sqlite','.db','.env','.pem','.key','.whl')))
 def test_baseline_checks_and_source_copies_match_every_runtime_path(self):
  for v,variant in self.manifest['variants'].items():
   for service in ['calendar-app','garyhub-lab']:
    folder='calendar-app'if service=='calendar-app'else'lab-service'
    for short in list(variant['baselines'][service])+variant['new_paths'][service]:
     rel=folder+'/'+short;self.assertEqual(self.inner.read('payload/'+v+'/'+rel),self.inner.read('source/'+v+'/'+rel))
if __name__=='__main__':unittest.main()
