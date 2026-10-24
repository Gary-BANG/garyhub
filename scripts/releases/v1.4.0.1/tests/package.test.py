import base64
import hashlib
import io
import json
import subprocess
import sys
import unittest
import zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
PACKAGE=Path(sys.argv.pop(1)) if len(sys.argv)>1 else None
BASE='4f5611b6c1d1e6def995ef9664b0035e551a806a'
def sha(b):return hashlib.sha256(b).hexdigest()
def norm(b):return sha(b.replace(b'\r\n',b'\n').rstrip(b'\n'))
class FinalPackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if PACKAGE is None:raise unittest.SkipTest('Pass the upgrade ZIP')
        cls.outer=zipfile.ZipFile(PACKAGE);cls.prefix=next(n.rsplit('/',1)[0]for n in cls.outer.namelist()if n.endswith('/payload.zip'))
        cls.data=cls.outer.read(cls.prefix+'/payload.zip');cls.inner=zipfile.ZipFile(io.BytesIO(cls.data));cls.m=json.loads(cls.inner.read('manifest.json'))
    @classmethod
    def tearDownClass(cls):cls.inner.close();cls.outer.close()
    def test_hashes_bind_every_inner_and_outer_file(self):
        self.assertEqual(set(self.inner.namelist()),set(self.m['files'])|{'manifest.json'})
        for name,expected in self.m['files'].items():self.assertEqual(sha(self.inner.read(name)),expected,name)
        expected={self.prefix+'/'+name:digest for digest,name in [line.split('  ',1)for line in self.outer.read(self.prefix+'/SHA256SUMS.txt').decode().splitlines()]}
        self.assertEqual(set(expected),set(self.outer.namelist())-{self.prefix+'/SHA256SUMS.txt'})
        for name,digest in expected.items():self.assertEqual(sha(self.outer.read(name)),digest,name)
    def test_installer_and_rollback_are_version_specific(self):
        code=self.outer.read(self.prefix+'/Install-GaryHub.ps1').decode('utf-8-sig')
        for value in [sha(self.data),"$version='1.4.0.1'","$requires='1.4.0.0'",'/opt/garyhub-update-v1.4.0.1-r1','StrictHostKeyChecking=yes','-PrepareOnly']:self.assertIn(value,code)
        for token in ['PACKAGE_SHA256','INSTALLER_BUILD_ID','RELEASE_VERSION','REQUIRES_VERSION']:self.assertNotIn(token,code)
        source=code.split("$bootstrap=@'",1)[1].split("'@",1)[0].replace('PAYLOAD_BASE64',base64.b64encode(self.data).decode()).replace('ROLLBACK_FLAG','False');compile(source,'bootstrap','exec')
        for name in ['RUN-UPDATE.cmd','ROLLBACK.cmd','PUSH-TO-GITHUB.cmd']:self.assertNotIn(b'\n',self.outer.read(self.prefix+'/'+name).replace(b'\r\n',b''))
        self.assertIn(b'-Rollback',self.outer.read(self.prefix+'/ROLLBACK.cmd'))
    def test_both_variants_use_exact_v1400_source_baselines_and_fixed_assets(self):
        self.assertEqual((self.m['release'],self.m['requires_release'],self.m['base_commit']),('v1.4.0.1','1.4.0.0',BASE))
        cfg=json.loads(self.inner.read('release-config.json'));self.assertEqual(set(self.m['variants']),{'1.3.4.1','1.3.4.2'})
        for variant,meta in self.m['variants'].items():
            prefix='payload/'+variant+'/';expected=set()
            for service,baseline in meta['baselines'].items():
                folder='calendar-app'if service=='calendar-app'else'lab-service'
                for short,allowed in baseline.items():
                    path=folder+'/'+short;choices=[path]
                    if variant=='1.3.4.1':choices.insert(0,'scripts/releases/v1.4.0.0/variant-overrides/'+variant+'/'+path)
                    for choice in choices:
                        p=subprocess.run(['git','-C',str(ROOT),'show',BASE+':'+choice],capture_output=True)
                        if p.returncode==0:break
                    self.assertEqual(p.returncode,0);self.assertEqual(allowed,[norm(p.stdout)]);expected.add(prefix+path)
                expected.update(prefix+folder+'/'+short for short in meta['new_paths'][service])
            self.assertEqual(expected,{n for n in self.inner.namelist()if n.startswith(prefix)})
            self.assertEqual('registerTotp(app' in self.inner.read(prefix+'calendar-app/app.js').decode(),variant=='1.3.4.2')
            html=self.inner.read(prefix+'lab-service/public/index.html').decode();self.assertEqual('href="/totp/"'in html,variant=='1.3.4.2');self.assertIn('data-tools-release="1.4.0.1"',html);self.assertIn('/tools-dock.js?v=1.4.0.1',html)
            for route,digest in cfg['asset_checksums'].items():self.assertEqual(sha(self.inner.read(prefix+'lab-service/public'+route)),digest)
            self.assertNotIn('!fine.matches',self.inner.read(prefix+'lab-service/public/tools-dock.js').decode())
            for service in ['calendar-app','lab-service']:self.assertEqual(json.loads(self.inner.read(prefix+service+'/public/privacy-ledger-release.json'))['version'],'1.4.0.1')
    def test_source_import_and_privacy_boundaries(self):
        source=json.loads(self.inner.read('git-source/manifest.json'));self.assertEqual(source['base_commit'],BASE);self.assertEqual(source['branch'],'update/garyhub-v1.4.0.1')
        for path in ['docs/PROJECT_CONTEXT.md','releases/1.4.0.1.json','docs/GARYHUB_V1_4_0_1_TESTS.md']:self.assertIn(path,source['files'])
        for name,digest in source['package_files'].items():
            content=self.inner.read('git-source/'+name);self.assertEqual(sha(content),digest)
            self.assertEqual(content,self.outer.read(self.prefix+'/git-source/'+name))
        for name in self.inner.namelist():
            self.assertFalse(any(part.lower()in{'node_modules','.git','private','private-backup'}for part in Path(name).parts),name)
            self.assertFalse(any(part.lower().startswith('.env') and part!='.env.example'for part in Path(name).parts),name)
            self.assertNotIn(Path(name).name,{'homepage-protected.json','profile-private.json','deployment-state.json'})
            self.assertFalse(name.endswith(('.db','.sqlite','.pem','.key')),name)
        script=self.inner.read('git-source/Push-GitHub.ps1').decode('utf-8-sig')
        self.assertIn("'worktree','add','-b'",script);self.assertNotIn('--force',script)
if __name__=='__main__':unittest.main()
