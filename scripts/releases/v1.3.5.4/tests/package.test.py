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
 def test_both_variants_extend_the_merged_v1353_without_changing_dependencies(self):
  self.assertEqual(set(self.manifest['variants']),{'1.3.4.1','1.3.4.2'});self.assertEqual(self.manifest['requires_release'],'1.3.5.3')
  self.assertEqual(self.manifest['base_commit'],'da8c9b48722a27d4800e4c7750c98d0ad248a2c8')
  for variant in self.manifest['variants']:
   prefix='payload/'+variant+'/'
   for rel in ['calendar-app/public/todos/import-format.js','calendar-app/public/todos/import-ui.js','calendar-app/public/todos/index.html','calendar-app/public/todos/todos.js','calendar-app/todos-api.js','calendar-app/test/todo-import.test.js','calendar-app/releases/garyhub-1.3.5.4.json']:
    self.assertIn(prefix+rel,self.inner.namelist())
   for rel in ['calendar-app/public/auth-redirect.js','lab-service/public/auth-redirect.js','calendar-app/account-admin.js','calendar-app/fixed-expenses.js','calendar-app/ledger-api.js','calendar-app/db.js','calendar-app/package.json','calendar-app/package-lock.json']:
    self.assertNotIn(prefix+rel,self.inner.namelist(),'unchanged code and dependencies must be inherited')
   app=self.inner.read(prefix+'calendar-app/app.js').decode();self.assertIn('1.3.5.4',app);self.assertEqual('registerTotp(app' in app,variant=='1.3.4.2')
   self.assertIn('TodoImportError',app)
   for name in ['build-package.py','sync-source.ps1','Push-GitHub.ps1']:
    self.assertIn('source/'+variant+'/scripts/releases/v1.3.5.4/'+name,self.inner.namelist())
 def test_installer_checks_the_actual_v1353_base_and_runs_import_checks_before_cutover(self):
  code=self.inner.read('deploy.py').decode()
  self.assertIn("next(iter(versions.values()))!='1.3.5.3'",code)
  self.assertIn(".version!=='1.3.5.3'",code)
  self.assertIn("'todo-import.cjs'",code);self.assertIn("'/app/test/todo-import.test.js'",code)
  self.assertLess(code.index("'todo-import.cjs'"),code.index("say('5/8"))
  self.assertIn("'todo_import_release'",code)
 def test_runtime_payloads_exclude_user_data_and_unrelated_lab_runtime(self):
  for name in self.inner.namelist():
   self.assertNotIn('/node_modules/',name)
   self.assertFalse(any(p.lower().startswith('.env') and p.lower()!='.env.example' for p in Path(name).parts),name)
   if name.startswith('payload/'):
    self.assertTrue('/public/lab/'not in name or name.endswith('/public/lab/cloud.js'));self.assertNotIn('homepage-protected.json',name);self.assertNotIn('profile-private.json',name);self.assertFalse(name.endswith(('.sqlite','.db','.env','.pem','.key','.whl','.wasm')))
 def test_baseline_checks_and_source_copies_match_every_runtime_path(self):
  for v,variant in self.manifest['variants'].items():
   for service in ['calendar-app','garyhub-lab']:
    folder='calendar-app'if service=='calendar-app'else'lab-service'
    for short in list(variant['baselines'][service])+variant['new_paths'][service]:
     rel=folder+'/'+short;self.assertEqual(self.inner.read('payload/'+v+'/'+rel),self.inner.read('source/'+v+'/'+rel))
if __name__=='__main__':unittest.main()
