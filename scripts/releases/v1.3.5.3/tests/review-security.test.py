"""Use synthetic secrets and temporary repositories; never read a user's .env."""
import contextlib,importlib.util,io,json,re,shutil,tempfile,unittest,zipfile
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[4]
VERSIONS=['1.3.5.2','1.3.5.3']
PATTERN=r'^(?:https://github\.com/|git@github\.com:|ssh://git@github\.com/)Gary-BANG/garyhub(?:\.git)?$'

def load(version):
 spec=importlib.util.spec_from_file_location('builder_'+version.replace('.','_'),ROOT/'scripts/releases'/('v'+version)/'build-package.py')
 module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module

class ReviewSecurityTests(unittest.TestCase):
 def test_every_shipping_git_script_matches_the_entire_reviewed_origin(self):
  good=['https://github.com/Gary-BANG/garyhub','https://github.com/Gary-BANG/garyhub.git','git@github.com:Gary-BANG/garyhub.git','ssh://git@github.com/Gary-BANG/garyhub.git']
  bad=['https://notgithub.com/Gary-BANG/garyhub.git','https://evil.example/https://github.com/Gary-BANG/garyhub.git','prefixgit@github.com:Gary-BANG/garyhub.git','https://github.com.evil.example/Gary-BANG/garyhub.git','https://github.com@evil.example/Gary-BANG/garyhub.git','https://github.com/Gary-BANG/garyhub.git/evil','https://github.com/Gary-BANG/other.git','http://github.com/Gary-BANG/garyhub.git','https://github.com:444/Gary-BANG/garyhub.git','https://github.com/Gary-BANG/garyhub.git?next=evil']
  for version in VERSIONS:
   for name in ['Push-GitHub.ps1','sync-source.ps1']:
    code=(ROOT/'scripts/releases'/('v'+version)/name).read_text(encoding='utf-8-sig');patterns=re.findall(r"\$remote -notmatch '([^']+)'",code)
    self.assertEqual(patterns,[PATTERN],version+'/'+name)
    for url in good:self.assertIsNotNone(re.search(patterns[0],url,re.I),url)
    for url in bad:self.assertIsNone(re.search(patterns[0],url,re.I),url)

 def fixture(self,root,version):
  here=root/'scripts/releases'/('v'+version)
  def put(rel,data='public fixture\n'):
   p=root/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(data);return p
  for rel in ['README.md','calendar-app/app.js','lab-service/server.cjs','calendar-app/.env.example']:
   put(rel)
  for v in ['1.3.5.1','1.3.5.2','1.3.5.3']:
   tag=v.replace('.','_')
   for end in ['.md','_TESTS.md']:put('docs/GARYHUB_V'+tag+end)
  for name in ['Push-GitHub.ps1','sync-source.ps1','build-package.py']:put('scripts/releases/v1.3.5.2/'+name)
  for name in ['README.md','TEST-RESULTS.md','deploy.py','sync-source.ps1','Push-GitHub.ps1','RUN-UPDATE.cmd','ROLLBACK.cmd','PUSH-TO-GITHUB.cmd']:put(str(here.relative_to(root)/name))
  put(str(here.relative_to(root)/'Install-GaryHub.template.ps1'),'PACKAGE_SHA256 INSTALLER_BUILD_ID')
  put(str(here.relative_to(root)/'tests/check.cjs'))
  put(str(here.relative_to(root)/'variant-overrides/1.3.4.1/calendar-app/app.js'))
  return here,put

 def test_both_builders_exclude_poisoned_runtime_source_tools_tests_and_overrides(self):
  for version in VERSIONS:
   with self.subTest(version=version),tempfile.TemporaryDirectory(prefix='garyhub-safe-package-')as tmp:
    root=Path(tmp);here,put=self.fixture(root,version);secret='SYNTHETIC_SECRET_DO_NOT_SHIP_5E1990'
    for rel in ['calendar-app/.env','calendar-app/.env.production','calendar-app/.ENV.local','lab-service/.env','lab-service/sub/.env.production.local','calendar-app/.env.d/hidden.js','calendar-app/private/hidden.js','calendar-app/data/live.sqlite','lab-service/homepage-protected.json',str(here.relative_to(root)/'.env'),str(here.relative_to(root)/'tests/.env'),str(here.relative_to(root)/'tests/.env.production'),str(here.relative_to(root)/'tests/.env.d/hidden.cjs'),str(here.relative_to(root)/'variant-overrides/1.3.4.1/calendar-app/.env')]:put(rel,secret)
    module=load(version)
    with patch.object(module,'ROOT',root),patch.object(module,'HERE',here),patch.object(module,'old',return_value=None),contextlib.redirect_stdout(io.StringIO()):report=module.build(root/'result.zip')
    try:
     with zipfile.ZipFile(report['file'])as outer:
      payload=outer.read(next(n for n in outer.namelist()if n.endswith('/payload.zip')))
      for name in outer.namelist():self.assertNotIn(secret.encode(),outer.read(name),name)
     with zipfile.ZipFile(io.BytesIO(payload))as inner:
      self.assertIn('payload/1.3.4.2/calendar-app/.env.example',inner.namelist())
      for name in inner.namelist():
       self.assertFalse(any(part.lower().startswith('.env')and part.lower()!='.env.example'for part in Path(name).parts),name)
       self.assertNotIn(secret.encode(),inner.read(name),name)
    finally:shutil.rmtree(report['work'])

 def test_private_and_linked_explicit_inputs_are_refused(self):
  for version in VERSIONS:
   with self.subTest(version=version),tempfile.TemporaryDirectory(prefix='garyhub-safe-input-')as tmp:
    root=Path(tmp);here,put=self.fixture(root,version);put('calendar-app/.env','synthetic')
    (root/'calendar-app/link.js').symlink_to(root/'calendar-app/app.js');module=load(version)
    with patch.object(module,'ROOT',root):
     for rel in ['calendar-app/.env','calendar-app/link.js','../outside.js']:
      with self.assertRaises(RuntimeError,msg=rel):module.source_bytes(rel)
    (here/'tests/link.cjs').symlink_to(root/'calendar-app/app.js')
    with patch.object(module,'ROOT',root),patch.object(module,'HERE',here),patch.object(module,'old',return_value=None),contextlib.redirect_stdout(io.StringIO()):
     with self.assertRaisesRegex(RuntimeError,'Linked runtime source'):module.build(root/'result.zip')

if __name__=='__main__':unittest.main()
