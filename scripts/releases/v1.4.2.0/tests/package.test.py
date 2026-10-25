"""Verify the final deliverable without rebuilding it; includes a binary source-patch round trip."""
import hashlib,io,json,os,subprocess,tempfile,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4];BASE='18cb483b3417b51686ab37b09ac2a69499233c71'
def sha(data):return hashlib.sha256(data).hexdigest()
class PackageTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.outer=zipfile.ZipFile(os.environ['GARYHUB_UPGRADE_ZIP']);cls.prefix=cls.outer.namelist()[0].split('/')[0];cls.inner=zipfile.ZipFile(io.BytesIO(cls.outer.read(cls.prefix+'/payload.zip')));cls.manifest=json.loads(cls.inner.read('manifest.json'))
 def test_install_rollback_and_outer_checksums(self):
  sums=self.outer.read(self.prefix+'/SHA256SUMS.txt').decode().splitlines()
  for line in sums:
   digest,name=line.split('  ',1);self.assertEqual(sha(self.outer.read(self.prefix+'/'+name)),digest,name)
  ps=self.outer.read(self.prefix+'/Install-GaryHub.ps1').decode('utf-8-sig');self.assertIn(sha(self.outer.read(self.prefix+'/payload.zip')),ps);self.assertNotIn('PACKAGE_SHA256',ps);self.assertIn("$version='1.4.2.0'",ps);self.assertIn("$requires='1.4.1.0'",ps)
  for name in ['RUN-UPDATE.cmd','ROLLBACK.cmd','PUSH-TO-GITHUB.cmd']:
   value=self.outer.read(self.prefix+'/'+name);self.assertIn(b'\r\n',value);self.assertNotIn(b'\n',value.replace(b'\r\n',b''))
 def test_payload_variants_assets_and_host_support(self):
  m=self.manifest;self.assertEqual(m['release'],'v1.4.2.0');self.assertEqual(m['requires_release'],'1.4.1.0');self.assertEqual(m['base_commit'],BASE)
  for name,digest in m['files'].items():self.assertEqual(sha(self.inner.read(name)),digest,name)
  for name in ['integrations.py','service_discovery.py','support/collect.py','support/garyhub-monitor.service','support/garyhub-monitor.timer','tests/miniflux-acceptance.cjs']:self.assertIn(name,m['files'])
  self.assertNotIn('payload/1.3.4.1/lab-service/public/totp/index.html',self.inner.namelist())
  config=json.loads(self.inner.read('release-config.json'))
  self.assertEqual(m['installer_build'],config['installer_build'])
  self.assertIn('http://calendar-check:3000',config['isolation_environment']['TRUSTED_ORIGINS'].split(','))
  ps=self.outer.read(self.prefix+'/Install-GaryHub.ps1').decode('utf-8-sig');self.assertIn("$build='"+config['installer_build']+"'",ps)
  for variant in m['variants']:
   prefix='payload/'+variant+'/'
   app=self.inner.read(prefix+'calendar-app/app.js').decode();server=self.inner.read(prefix+'lab-service/server.cjs').decode();html=self.inner.read(prefix+'lab-service/public/index.html').decode()
   self.assertEqual('const {migrateTotp,registerTotp}'in app,variant=='1.3.4.2');self.assertIn('registerToolAccess',app);self.assertIn('registerDailyQuote',app);self.assertIn('createReadingProxy',server);self.assertIn('data-tool="server-monitor" hidden',html)
   self.assertEqual(json.loads(self.inner.read(prefix+'calendar-app/public/privacy-ledger-release.json'))['version'],'1.4.2.0')
   for asset in config['asset_checksums']:
    folder='calendar-app/public'if asset['host'].startswith('calendar')else'lab-service/public';self.assertEqual(sha(self.inner.read(prefix+folder+asset['route'])),asset['sha256'])
   self.assertEqual(self.inner.read(prefix+'calendar-app/public/ambient.mp3'),self.inner.read(prefix+'lab-service/public/ambient.mp3'))
 def test_packaged_installer_imports_all_its_own_dependencies(self):
  with tempfile.TemporaryDirectory(prefix='garyhub142-import-smoke-')as temp:
   root=Path(temp)
   for name in ['deploy.py','deploy_runtime.py','integrations.py','service_discovery.py','release-config.json']:(root/name).write_bytes(self.inner.read(name))
   code="import importlib.util;from pathlib import Path;p=Path('deploy.py').resolve();s=importlib.util.spec_from_file_location('dependency_smoke',p);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);assert set(m.d.HOOKS)=={'prepare','validate','apply','rollback'}"
   subprocess.run([__import__('sys').executable,'-c',code],cwd=root,check=True)
 def test_private_boundaries_and_exact_source_patch(self):
  for name in self.inner.namelist():
   p=Path(name);self.assertFalse(any(x.lower()in ['.git','node_modules','private','private-backup']for x in p.parts),name);self.assertFalse(any(x.startswith('.env')and x!='.env.example'for x in p.parts),name);self.assertNotIn(p.suffix.lower(),['.db','.sqlite','.sqlite3','.pem','.key'])
  source=json.loads(self.inner.read('git-source/manifest.json'));self.assertEqual(source['base_commit'],BASE);self.assertEqual(source['branch'],'update/garyhub-v1.4.2.0')
  for name,digest in source['package_files'].items():self.assertEqual(sha(self.inner.read('git-source/'+name)),digest)
  with tempfile.TemporaryDirectory(prefix='garyhub142-import-')as temp:
   work=Path(temp)/'source';subprocess.run(['git','clone','--quiet','--no-hardlinks',str(ROOT),str(work)],check=True);subprocess.run(['git','-C',str(work),'checkout','--quiet','--detach',BASE],check=True)
   patch=Path(temp)/'changes.patch';patch.write_bytes(self.inner.read('git-source/changes.patch'));subprocess.run(['git','-C',str(work),'apply','--check',str(patch)],check=True);subprocess.run(['git','-C',str(work),'apply',str(patch)],check=True)
   for name,info in source['files'].items():self.assertEqual(sha((work/name).read_bytes()),info['sha256'],name)
if __name__=='__main__':unittest.main()
