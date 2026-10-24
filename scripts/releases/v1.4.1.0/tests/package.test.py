"""One final integrity check against the actual delivered upgrade ZIP."""
import base64,hashlib,io,json,subprocess,sys,unittest,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
PACKAGE=Path(sys.argv.pop(1))if len(sys.argv)>1 else None
BASE='637d86faae37d6c06b74b15bf850e82e301c8ad7'
def sha(b):return hashlib.sha256(b).hexdigest()
def norm(b):return sha(b.replace(b'\r\n',b'\n').rstrip(b'\n'))
class PackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if PACKAGE is None:raise unittest.SkipTest('Pass final upgrade ZIP')
        cls.outer=zipfile.ZipFile(PACKAGE);cls.prefix=next(n.rsplit('/',1)[0]for n in cls.outer.namelist()if n.endswith('/payload.zip'));cls.data=cls.outer.read(cls.prefix+'/payload.zip');cls.inner=zipfile.ZipFile(io.BytesIO(cls.data));cls.m=json.loads(cls.inner.read('manifest.json'))
    @classmethod
    def tearDownClass(cls):cls.inner.close();cls.outer.close()
    def test_complete_inner_and_outer_hashes(self):
        self.assertEqual(set(self.inner.namelist()),set(self.m['files'])|{'manifest.json'})
        for name,expected in self.m['files'].items():self.assertEqual(sha(self.inner.read(name)),expected,name)
        hashes={self.prefix+'/'+name:digest for digest,name in[line.split('  ',1)for line in self.outer.read(self.prefix+'/SHA256SUMS.txt').decode().splitlines()]}
        self.assertEqual(set(hashes),set(self.outer.namelist())-{self.prefix+'/SHA256SUMS.txt'})
        for name,digest in hashes.items():self.assertEqual(sha(self.outer.read(name)),digest,name)
    def test_installer_rollback_and_bootstrap(self):
        s=self.outer.read(self.prefix+'/Install-GaryHub.ps1').decode('utf-8-sig')
        for marker in[sha(self.data),"$version='1.4.1.0'","$requires='1.4.0.1'",'/opt/garyhub-update-v1.4.1.0-r1','StrictHostKeyChecking=yes','-PrepareOnly']:self.assertIn(marker,s)
        for marker in['PACKAGE_SHA256','INSTALLER_BUILD_ID','RELEASE_VERSION','REQUIRES_VERSION']:self.assertNotIn(marker,s)
        code=s.split("$bootstrap=@'",1)[1].split("'@",1)[0].replace('PAYLOAD_BASE64',base64.b64encode(self.data).decode()).replace('ROLLBACK_FLAG','False');compile(code,'bootstrap','exec')
        for name in['RUN-UPDATE.cmd','ROLLBACK.cmd','PUSH-TO-GITHUB.cmd']:self.assertNotIn(b'\n',self.outer.read(self.prefix+'/'+name).replace(b'\r\n',b''))
        self.assertIn(b'-Rollback',self.outer.read(self.prefix+'/ROLLBACK.cmd'))
    def test_both_variants_have_exact_reviewed_v1401_baselines(self):
        self.assertEqual((self.m['release'],self.m['requires_release'],self.m['base_commit']),('v1.4.1.0','1.4.0.1',BASE))
        for variant,meta in self.m['variants'].items():
            prefix='payload/'+variant+'/';expected=set()
            for service,baselines in meta['baselines'].items():
                folder='calendar-app'if service=='calendar-app'else'lab-service'
                for short,allowed in baselines.items():
                    path=folder+'/'+short;choices=[path]
                    if variant=='1.3.4.1':choices.insert(0,'scripts/releases/v1.4.0.1/variant-overrides/'+variant+'/'+path)
                    for choice in choices:
                        p=subprocess.run(['git','-C',str(ROOT),'show',BASE+':'+choice],capture_output=True)
                        if p.returncode==0:break
                    self.assertEqual(p.returncode,0);self.assertEqual(allowed,[norm(p.stdout)]);expected.add(prefix+path)
                expected.update(prefix+folder+'/'+p for p in meta['new_paths'][service])
            self.assertEqual(expected,{n for n in self.inner.namelist()if n.startswith(prefix)})
            app=self.inner.read(prefix+'calendar-app/app.js').decode();self.assertIn('registerResearch(app',app);self.assertEqual('registerTotp(app'in app,variant=='1.3.4.2')
            html=self.inner.read(prefix+'lab-service/public/index.html').decode();self.assertIn('data-tool="research"',html);self.assertEqual('href="/totp/"'in html,variant=='1.3.4.2')
            for service in ['calendar-app','lab-service']:self.assertEqual(json.loads(self.inner.read(prefix+service+'/public/privacy-ledger-release.json'))['version'],'1.4.1.0')
        config=json.loads(self.inner.read('release-config.json'))
        for asset in config['asset_checksums']:
            folder='calendar-app/public'if asset['host']=='calendar.garyhub.uk'else'lab-service/public'
            for variant in self.m['variants']:self.assertEqual(sha(self.inner.read('payload/'+variant+'/'+folder+asset['route'])),asset['sha256'])
    def test_private_boundaries_and_safe_source_importer(self):
        source=json.loads(self.inner.read('git-source/manifest.json'));self.assertEqual(source['base_commit'],BASE);self.assertEqual(source['branch'],'update/garyhub-v1.4.1.0')
        for name in['docs/PROJECT_CONTEXT.md','docs/GARYHUB_V1_4_1_0_TESTS.md','releases/1.4.1.0.json','calendar-app/research-api.js']:self.assertIn(name,source['files'])
        for name,digest in source['package_files'].items():self.assertEqual(sha(self.inner.read('git-source/'+name)),digest);self.assertEqual(self.inner.read('git-source/'+name),self.outer.read(self.prefix+'/git-source/'+name))
        for name in self.inner.namelist():
            self.assertFalse(any(p.lower()in{'.git','node_modules','private','private-backup'}for p in Path(name).parts),name)
            self.assertFalse(any(p.lower().startswith('.env')and p!='.env.example'for p in Path(name).parts),name)
            self.assertFalse(name.endswith(('.sqlite','.db','.pem','.key')),name)
        importer=self.inner.read('git-source/Push-GitHub.ps1').decode('utf-8-sig');self.assertIn("'worktree','add','-b'",importer);self.assertNotIn('--force',importer)
if __name__=='__main__':unittest.main()
