from pathlib import Path
import base64,hashlib,io,json,re,sys,tempfile,unittest,zipfile
PACKAGE=Path(sys.argv[1]).resolve()if len(sys.argv)>1 and sys.argv[1].endswith('.zip')else None
if PACKAGE:sys.argv.pop(1)
class PackageTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  if PACKAGE is None:raise unittest.SkipTest('Pass the built update ZIP as an argument')
  cls.outer=zipfile.ZipFile(PACKAGE);cls.prefix=next(n.rsplit('/',1)[0]for n in cls.outer.namelist()if n.endswith('/payload.zip'));cls.payload=cls.outer.read(cls.prefix+'/payload.zip');cls.inner=zipfile.ZipFile(io.BytesIO(cls.payload));cls.manifest=json.loads(cls.inner.read('manifest.json'))
 def test_every_payload_file_matches_the_manifest(self):
  for name,expected in self.manifest['files'].items():self.assertEqual(hashlib.sha256(self.inner.read(name)).hexdigest(),expected,name)
  self.assertEqual(set(self.inner.namelist()),set(self.manifest['files'])|{'manifest.json'})
 def test_outer_powershell_binds_the_exact_payload_and_bootstrap_is_valid(self):
  script=self.outer.read(self.prefix+'/Install-GaryHub.ps1').decode('utf-8-sig');self.assertIn(hashlib.sha256(self.payload).hexdigest(),script);self.assertNotIn('PACKAGE_SHA256',script);self.assertNotIn('INSTALLER_BUILD_ID',script)
  bootstrap=script.split("$bootstrap=@'",1)[1].split("'@",1)[0].replace('PAYLOAD_BASE64',base64.b64encode(self.payload).decode()).replace('ROLLBACK_FLAG','False');compile(bootstrap,'ssh-bootstrap','exec');self.assertIn('StrictHostKeyChecking=yes',script)
 def test_both_variants_have_runtime_code_and_generic_placeholders(self):
  self.assertEqual(set(self.manifest['variants']),{'1.3.4.1','1.3.4.2'})
  for v in self.manifest['variants']:
   for f in ['calendar-app/todos-api.js','calendar-app/public/todos/index.html','calendar-app/public/i18n/i18n.js','lab-service/public/i18n/i18n.js']:
    self.assertIn('payload/'+v+'/'+f,self.inner.namelist())
   home=self.inner.read('payload/'+v+'/lab-service/public/homepage.html').decode();self.assertNotIn('GPA &amp; Rank',home);self.assertIn('该部分已隐藏',home)
   self.assertNotIn('GARYHUB_TOTP_ENCRYPTION_KEY=',self.inner.read('payload/'+v+'/calendar-app/public/i18n/dictionary.js').decode())
 def test_excluded_lab_and_private_files_are_not_runtime_payloads(self):
  for name in self.inner.namelist():
   self.assertNotIn('/node_modules/',name)
   if name.startswith('payload/'):
    self.assertNotIn('/public/lab/',name);self.assertNotIn('homepage-protected.json',name);self.assertNotIn('profile-private.json',name);self.assertFalse(name.endswith(('.sqlite','.db','.env','.pem','.key')))
 def test_source_and_runtime_variants_agree(self):
  for v in self.manifest['variants']:
   for name in self.inner.namelist():
    prefix='payload/'+v+'/'
    if name.startswith(prefix):self.assertEqual(self.inner.read(name),self.inner.read('source/'+v+'/'+name[len(prefix):]),name)
if __name__=='__main__':unittest.main()
