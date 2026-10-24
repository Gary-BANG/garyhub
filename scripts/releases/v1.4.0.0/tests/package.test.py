"""Check the delivered bytes, baselines and both capability payloads once."""
import base64
import hashlib
import io
import json
import subprocess
import sys
import unittest
import zipfile
from pathlib import Path

PACKAGE=Path(sys.argv.pop(1)).resolve() if len(sys.argv)>1 else None
ROOT=Path(__file__).resolve().parents[4]
BASE='bf5d8e2aa1f87024ba3c183b5e5d4155dc6e6a4f'
def sha(data):return hashlib.sha256(data).hexdigest()
def norm(data):return sha(data.replace(b'\r\n',b'\n').rstrip(b'\n'))

class FinalPackageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if PACKAGE is None:raise unittest.SkipTest('Pass the final upgrade ZIP')
        cls.outer=zipfile.ZipFile(PACKAGE)
        cls.prefix=next(n.rsplit('/',1)[0] for n in cls.outer.namelist() if n.endswith('/payload.zip'))
        cls.payload=cls.outer.read(cls.prefix+'/payload.zip')
        cls.inner=zipfile.ZipFile(io.BytesIO(cls.payload))
        cls.manifest=json.loads(cls.inner.read('manifest.json'))
    @classmethod
    def tearDownClass(cls):cls.inner.close();cls.outer.close()
    def test_all_inner_and_outer_hashes(self):
        self.assertEqual(set(self.inner.namelist()),set(self.manifest['files'])|{'manifest.json'})
        for name,digest in self.manifest['files'].items():self.assertEqual(sha(self.inner.read(name)),digest,name)
        expected={}
        for line in self.outer.read(self.prefix+'/SHA256SUMS.txt').decode().splitlines():
            digest,name=line.split('  ',1);expected[self.prefix+'/'+name]=digest
        self.assertEqual(set(expected),set(self.outer.namelist())-{self.prefix+'/SHA256SUMS.txt'})
        for name,digest in expected.items():self.assertEqual(sha(self.outer.read(name)),digest,name)
    def test_installer_and_rollback_targets(self):
        code=self.outer.read(self.prefix+'/Install-GaryHub.ps1').decode('utf-8-sig')
        for value in [sha(self.payload),"$version='1.4.0.0'","$requires='1.3.6.1'",'/opt/garyhub-update-v1.4.0.0-r1','StrictHostKeyChecking=yes','-PrepareOnly']:self.assertIn(value,code)
        for token in ['PACKAGE_SHA256','INSTALLER_BUILD_ID','RELEASE_VERSION','REQUIRES_VERSION']:self.assertNotIn(token,code)
        bootstrap=code.split("$bootstrap=@'",1)[1].split("'@",1)[0].replace('PAYLOAD_BASE64',base64.b64encode(self.payload).decode()).replace('ROLLBACK_FLAG','False')
        compile(bootstrap,'ssh-bootstrap','exec')
        for name in ['RUN-UPDATE.cmd','ROLLBACK.cmd','PUSH-TO-GITHUB.cmd']:
            data=self.outer.read(self.prefix+'/'+name);self.assertNotIn(b'\n',data.replace(b'\r\n',b''))
        self.assertIn(b'-Rollback',self.outer.read(self.prefix+'/ROLLBACK.cmd'))
    def test_exact_baselines_and_two_capability_variants(self):
        m=self.manifest
        self.assertEqual((m['release'],m['requires_release'],m['base_commit']),('v1.4.0.0','1.3.6.1',BASE))
        self.assertEqual(set(m['variants']),{'1.3.4.1','1.3.4.2'})
        for variant,metadata in m['variants'].items():
            prefix='payload/'+variant+'/'
            expected=set()
            for service,baselines in metadata['baselines'].items():
                folder='calendar-app' if service=='calendar-app' else 'lab-service'
                for short,allowed in baselines.items():
                    path=folder+'/'+short;expected.add(prefix+path);choices=[path]
                    if variant=='1.3.4.1':choices.insert(0,'scripts/releases/v1.3.6.1/variant-overrides/'+variant+'/'+path)
                    for choice in choices:
                        p=subprocess.run(['git','-C',str(ROOT),'show',BASE+':'+choice],capture_output=True)
                        if p.returncode==0:break
                    self.assertEqual(p.returncode,0,path);self.assertEqual(allowed,[norm(p.stdout)],path)
                expected.update(prefix+folder+'/'+short for short in metadata['new_paths'][service])
            self.assertEqual(expected,{n for n in self.inner.namelist() if n.startswith(prefix)})
            app=self.inner.read(prefix+'calendar-app/app.js').decode()
            self.assertEqual('registerTotp(app' in app,variant=='1.3.4.2');self.assertIn('hubVersion: "1.4.0.0"',app)
            html=self.inner.read(prefix+'lab-service/public/index.html').decode()
            self.assertEqual('href="/totp/"' in html,variant=='1.3.4.2');self.assertIn('data-tools-release="1.4.0.0"',html)
            for asset in ['tools-catalog.js','tools-dock.js','tools-dock.css']:self.assertIn(prefix+'lab-service/public/'+asset,self.inner.namelist())
            for service in ['calendar-app','lab-service']:self.assertEqual(json.loads(self.inner.read(prefix+service+'/public/privacy-ledger-release.json'))['version'],'1.4.0.0')
            for unchanged in ['calendar-app/db.js','calendar-app/package.json','calendar-app/package-lock.json','lab-service/public/hub.css','lab-service/public/hub.js','lab-service/public/useful/markdown-viewer/app.js']:
                self.assertNotIn(prefix+unchanged,self.inner.namelist())
    def test_shared_protections_and_dock_checks_are_included(self):
        config=json.loads(self.inner.read('release-config.json'))
        self.assertEqual(config['requires_release'],'1.3.6.1');self.assertEqual(config['baseline_adapter'],'scripts/releases/v1.3.6.1')
        for name in config['test_inputs']:self.assertIn('tests/'+name,self.inner.namelist())
        code=self.inner.read('deploy_runtime.py').decode()
        for marker in ['next(iter(versions.values()))!=REQUIRES',"s['status']='notification-pending'",'check_active(lives)',"'alreadyPublished'",'backup_lab(labdata',"snapshot(caldata/filename"]:self.assertIn(marker,code)
        self.assertLess(code.index("for test in CONFIG['isolation_checks']"),code.index("say('5/8"))
        adapter=self.inner.read('deploy.py').decode();self.assertIn('shared_https()',adapter);self.assertIn('/tools-dock.css',adapter)
    def test_source_importer_is_complete_and_version_specific(self):
        manifest=json.loads(self.inner.read('git-source/manifest.json'))
        self.assertEqual(manifest['base_commit'],BASE);self.assertEqual(manifest['branch'],'update/garyhub-v1.4.0.0')
        self.assertEqual(manifest['commit_message'],'Add searchable Tools icon grid and smooth Dock navigation')
        for name in ['docs/PROJECT_CONTEXT.md','releases/1.4.0.0.json','docs/GARYHUB_V1_4_0_0_TESTS.md','scripts/releases/v1.4.0.0/release-config.json']:self.assertIn(name,manifest['files'])
        for name,digest in manifest['package_files'].items():
            data=self.inner.read('git-source/'+name);self.assertEqual(sha(data),digest);self.assertEqual(data,self.outer.read(self.prefix+'/git-source/'+name))
        script=self.inner.read('git-source/Push-GitHub.ps1').decode('utf-8-sig');self.assertIn("'worktree','add','-b'",script);self.assertNotIn('--force',script)
    def test_no_private_data_or_unrequested_runtime_dependencies(self):
        for name in self.inner.namelist():
            parts=Path(name).parts
            self.assertFalse(any(p.lower() in {'node_modules','.git','private-backup','private'} for p in parts),name)
            self.assertFalse(any(p.lower().startswith('.env') and p!='.env.example' for p in parts),name)
            self.assertNotIn(Path(name).name,{'homepage-protected.json','profile-private.json','deployment-state.json'})
            self.assertFalse(name.endswith(('.sqlite','.db','.pem','.key')),name)
        for variant in self.manifest['variants']:
            release=json.loads(self.inner.read('payload/'+variant+'/calendar-app/releases/garyhub-1.4.0.0.json'))
            self.assertEqual({n['scope'] for n in release['notes']},{'tools'});self.assertEqual(len(release['notes']),2)

if __name__=='__main__':unittest.main()
