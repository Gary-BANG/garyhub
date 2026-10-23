"""Verify the final upgrade bytes without rebuilding or connecting to production."""
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
BASE='697daf65c269a8f2169857b0eb21e8cf84cf6a3e'
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
    def test_inner_manifest_and_outer_checksum_list_bind_every_file(self):
        self.assertEqual(set(self.inner.namelist()),set(self.manifest['files'])|{'manifest.json'})
        for name,digest in self.manifest['files'].items():self.assertEqual(sha(self.inner.read(name)),digest,name)
        checks=self.outer.read(self.prefix+'/SHA256SUMS.txt').decode().splitlines()
        expected={}
        for line in checks:
            digest,name=line.split('  ',1);expected[self.prefix+'/'+name]=digest
        self.assertEqual(set(expected),set(self.outer.namelist())-{self.prefix+'/SHA256SUMS.txt'})
        for name,digest in expected.items():self.assertEqual(sha(self.outer.read(name)),digest,name)
    def test_bootstrap_targets_new_release_and_compiles(self):
        code=self.outer.read(self.prefix+'/Install-GaryHub.ps1').decode('utf-8-sig')
        self.assertIn(sha(self.payload),code);self.assertIn("$version='1.3.6.1'",code);self.assertIn("$requires='1.3.6.0'",code)
        self.assertIn('/opt/garyhub-update-v1.3.6.1-r1',code);self.assertIn('StrictHostKeyChecking=yes',code)
        self.assertIn('-PrepareOnly',code)
        for token in ['PACKAGE_SHA256','INSTALLER_BUILD_ID','RELEASE_VERSION','REQUIRES_VERSION']:self.assertNotIn(token,code)
        bootstrap=code.split("$bootstrap=@'",1)[1].split("'@",1)[0].replace('PAYLOAD_BASE64',base64.b64encode(self.payload).decode()).replace('ROLLBACK_FLAG','False')
        compile(bootstrap,'ssh-bootstrap','exec')
        for name in ['RUN-UPDATE.cmd','ROLLBACK.cmd','PUSH-TO-GITHUB.cmd']:
            data=self.outer.read(self.prefix+'/'+name);self.assertNotIn(b'\n',data.replace(b'\r\n',b''))
        self.assertIn(b'-Rollback',self.outer.read(self.prefix+'/ROLLBACK.cmd'))
    def test_exact_base_hashes_and_capability_variants(self):
        m=self.manifest
        self.assertEqual(m['release'],'v1.3.6.1');self.assertEqual(m['requires_release'],'1.3.6.0');self.assertEqual(m['base_commit'],BASE)
        self.assertEqual(set(m['variants']),{'1.3.4.1','1.3.4.2'})
        for variant,metadata in m['variants'].items():
            prefix='payload/'+variant+'/'
            expected=set()
            for service,baselines in metadata['baselines'].items():
                folder='calendar-app' if service=='calendar-app' else 'lab-service'
                for short,allowed in baselines.items():
                    path=folder+'/'+short;expected.add(prefix+path)
                    choices=[path]
                    if variant=='1.3.4.1':choices.insert(0,'scripts/releases/v1.3.6.0/variant-overrides/'+variant+'/'+path)
                    for choice in choices:
                        p=subprocess.run(['git','-C',str(ROOT),'show',BASE+':'+choice],capture_output=True)
                        if p.returncode==0:break
                    self.assertEqual(p.returncode,0,path);self.assertEqual(allowed,[norm(p.stdout)],path)
                expected.update(prefix+folder+'/'+short for short in metadata['new_paths'][service])
            self.assertEqual(expected,{n for n in self.inner.namelist() if n.startswith(prefix)})
            app=self.inner.read(prefix+'calendar-app/app.js').decode()
            self.assertEqual('registerTotp(app' in app,variant=='1.3.4.2');self.assertIn('hubVersion: "1.3.6.1"',app)
            catalog=self.inner.read(prefix+'lab-service/public/index.html').decode()
            self.assertEqual('href="/totp/"' in catalog,variant=='1.3.4.2');self.assertIn('/useful/tool-i18n.js',catalog)
            for service in ['calendar-app','lab-service']:
                self.assertEqual(json.loads(self.inner.read(prefix+service+'/public/privacy-ledger-release.json'))['version'],'1.3.6.1')
            for unchanged in ['calendar-app/db.js','calendar-app/package.json','calendar-app/package-lock.json','calendar-app/fixed-expenses.js','lab-service/public/useful/vendor/pdf.mjs']:
                self.assertNotIn(prefix+unchanged,self.inner.namelist())
    def test_configuration_and_shared_runtime_are_new_version_aware(self):
        config=json.loads(self.inner.read('release-config.json'))
        self.assertEqual(config['version'],'1.3.6.1');self.assertEqual(config['requires_release'],'1.3.6.0')
        code=self.inner.read('deploy_runtime.py').decode()
        self.assertIn('next(iter(versions.values()))!=REQUIRES',code)
        self.assertIn("slug='garyhub-v'+VERSION.replace('.','')",code)
        self.assertNotIn('v1360-check',code);self.assertIn("s['status']='notification-pending'",code)
        self.assertLess(code.index("for test in CONFIG['isolation_checks']"),code.index("say('5/8"))
        self.assertIn("'alreadyPublished'",code);self.assertIn("check_active(lives)",code)
        for name in config['test_inputs']:self.assertIn('tests/'+name,self.inner.namelist())
    def test_source_importer_is_complete_and_matches_the_inner_payload(self):
        manifest=json.loads(self.inner.read('git-source/manifest.json'))
        self.assertEqual(manifest['base_commit'],BASE);self.assertEqual(manifest['branch'],'update/garyhub-v1.3.6.1')
        self.assertIn('docs/PROJECT_CONTEXT.md',manifest['files'])
        self.assertIn('scripts/releases/v1.3.6.1/release-config.json',manifest['files'])
        for name,digest in manifest['package_files'].items():
            data=self.inner.read('git-source/'+name)
            self.assertEqual(sha(data),digest)
            self.assertEqual(data,self.outer.read(self.prefix+'/git-source/'+name))
        script=self.inner.read('git-source/Push-GitHub.ps1').decode('utf-8-sig')
        self.assertIn("'worktree','add','-b'",script);self.assertNotIn('--force',script)
    def test_private_data_and_external_dependencies_are_not_shipped(self):
        for name in self.inner.namelist():
            parts=Path(name).parts
            self.assertFalse(any(p.lower() in {'node_modules','.git','private-backup','private'} for p in parts),name)
            self.assertFalse(any(p.lower().startswith('.env') and p!='.env.example' for p in parts),name)
            self.assertNotIn(Path(name).name,{'homepage-protected.json','profile-private.json','deployment-state.json'})
            self.assertFalse(name.endswith(('.sqlite','.db','.pem','.key')),name)
        for variant in self.manifest['variants']:
            prefix='payload/'+variant+'/lab-service/public/useful/'
            module=self.inner.read(prefix+'markdown-viewer/app.js').decode();self.assertIn("from './zip-reader.mjs'",module)
            self.assertIn('data-user-content',self.inner.read(prefix+'markdown-viewer/index.html').decode())
            release=json.loads(self.inner.read('payload/'+variant+'/calendar-app/releases/garyhub-1.3.6.1.json'))
            self.assertEqual({n['scope'] for n in release['notes']},{'tools'})

if __name__=='__main__':unittest.main()
