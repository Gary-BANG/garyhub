"""Regressions for inherited image sources and retrying a failed first package."""
import base64,hashlib,importlib.util,io,json,re,shutil,subprocess,tempfile,unittest,zipfile
from html.parser import HTMLParser
from pathlib import Path
from unittest.mock import patch

HERE=Path(__file__).resolve().parents[1]
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
builder=module('package_builder',HERE/'build-package.py');deploy=module('package_deploy',HERE/'deploy.py')
class Cards(HTMLParser):
 def __init__(self,text):super().__init__();self.links=[];self.feed(text)
 def handle_starttag(self,tag,attrs):
  attrs=dict(attrs)
  if tag=='a' and 'card' in attrs.get('class','').split():self.links.append(attrs.get('href'))

class PackageTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.temp=tempfile.TemporaryDirectory();cls.root=Path(cls.temp.name)
  result=subprocess.check_output(['python3',str(HERE/'build-package.py'),str(cls.root)],text=True);cls.build=json.loads(result)
  cls.outer=zipfile.ZipFile(cls.build['file']);cls.prefix=cls.outer.namelist()[0].split('/')[0]+'/'
  cls.payload=cls.outer.read(cls.prefix+'payload.zip');cls.inner=zipfile.ZipFile(io.BytesIO(cls.payload));cls.manifest=json.loads(cls.inner.read('manifest.json'))
 @classmethod
 def tearDownClass(cls):
  cls.inner.close();cls.outer.close();cls.temp.cleanup();shutil.rmtree(cls.build['work'])
 def test_inherited_variants_pass_but_repository_base_is_not_relaxed(self):
  provenance=json.loads(self.inner.read('reviewed-runtime-baselines.json'))
  baseline=json.loads(self.inner.read('repo-baseline.json'))['lab-service/public/index.html']
  self.assertEqual(baseline,['8bb36d60b3d321159734576061d198b0c97de4d4e5fcd27655a26d25dee1b855'])
  for variant in provenance['variants']:
   with self.subTest(variant=variant['fixture']),tempfile.TemporaryDirectory()as tmp:
    source=Path(tmp);(source/'public').mkdir();(source/'public/index.html').write_bytes(self.inner.read(variant['fixture']))
    self.assertEqual(deploy.source_mismatches('garyhub-lab',source,{'public/index.html':self.manifest['baselines']['garyhub-lab']['public/index.html']}),[])
    self.assertNotIn(variant['normalized_sha256'],baseline)
 def test_unknown_changes_remain_rejected_and_all_mismatches_are_identified(self):
  with tempfile.TemporaryDirectory()as tmp:
   source=Path(tmp);(source/'public').mkdir();(source/'public/index.html').write_text('<script>unknown change</script>');(source/'server.cjs').write_text('unknown backend change')
   result=deploy.source_mismatches('garyhub-lab',source,{p:self.manifest['baselines']['garyhub-lab'][p]for p in ['public/index.html','server.cjs']})
   self.assertEqual([r['file']for r in result],['public/index.html','server.cjs']);self.assertTrue(all(re.fullmatch('[0-9a-f]{64}',r['normalized_sha256'])for r in result))
 def test_corrupted_review_fixture_cannot_expand_allowed_sources(self):
  with tempfile.TemporaryDirectory()as tmp:
   here=Path(tmp);shutil.copy2(HERE/'reviewed-runtime-baselines.json',here);shutil.copytree(HERE/'tests/fixtures',here/'tests/fixtures')
   p=next((here/'tests/fixtures').glob('*.html'));p.write_text(p.read_text()+'<p>unreviewed edit</p>')
   with self.assertRaisesRegex(RuntimeError,'fixture checksum mismatch'):builder.add_reviewed_runtime_baselines({'garyhub-lab':{'public/index.html':['git-base']}},here)
 def test_all_existing_tools_survive_and_totp_is_added_once(self):
  page=self.inner.read('payload/lab-service/public/index.html').decode();links=Cards(page).links
  self.assertEqual(links.count('/totp/'),1)
  for variant in json.loads(self.inner.read('reviewed-runtime-baselines.json'))['variants']:
   old=Cards(self.inner.read(variant['fixture']).decode()).links
   self.assertEqual(len(old),8);self.assertEqual([href for href in links if href!='/totp/'],old)
 def test_archive_and_every_manifest_entry_are_intact(self):
  self.assertIsNone(self.outer.testzip());self.assertIsNone(self.inner.testzip())
  for rel,digest in self.manifest['files'].items():self.assertEqual(hashlib.sha256(self.inner.read(rel)).hexdigest(),digest,rel)
  self.assertEqual(self.manifest['installer_build'],'v1.3.4.2-r2');self.assertEqual(self.manifest['release'],'v1.3.4.2')
 def test_retry_bootstrap_keeps_old_cache_and_rejects_changed_r2_package(self):
  installer=self.outer.read(self.prefix+'Install-GaryHub.ps1').decode('utf-8-sig')
  self.assertIn("$build='v1.3.4.2-r2'",installer);self.assertIn("('GaryHub\\updates\\'+$build)",installer)
  self.assertNotIn('INSTALLER_BUILD_ID',installer);self.assertNotIn('PACKAGE_SHA256',installer)
  bootstrap=re.search(r"\$bootstrap=@'\r?\n(.*?)\r?\n'@",installer,re.S).group(1).replace('PAYLOAD_BASE64',base64.b64encode(self.payload).decode()).replace('ROLLBACK_FLAG','False')
  with tempfile.TemporaryDirectory()as tmp:
   parent=Path(tmp);old=parent/'garyhub-update-v1.3.4.2';old.mkdir();(old/'package.sha256').write_text('original stopped package');current=parent/'garyhub-update-v1.3.4.2-r2'
   bootstrap=bootstrap.replace('/opt/garyhub-update-v1.3.4.2-r2',str(current))
   with patch('subprocess.call',return_value=0)as call:
    with self.assertRaises(SystemExit)as result:exec(compile(bootstrap,'bootstrap-check','exec'),{})
    self.assertEqual(result.exception.code,0);self.assertEqual(call.call_args.args[0],['python3',str(current/'deploy.py')])
   self.assertEqual((old/'package.sha256').read_text(),'original stopped package');self.assertTrue((current/'deploy.py').is_file())
   (current/'package.sha256').write_text('different package occupying r2')
   with patch('subprocess.call')as call:
    with self.assertRaisesRegex(RuntimeError,'Another package already occupies'):exec(compile(bootstrap,'bootstrap-check','exec'),{})
    call.assert_not_called()
if __name__=='__main__':unittest.main()
