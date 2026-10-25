"""Exercise the installer's actual isolated command path and failure cleanup."""
import contextlib,importlib.util,io,json,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[4]
spec=importlib.util.spec_from_file_location('isolation_runtime',ROOT/'scripts/updater/deploy_runtime.py')
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
spec=importlib.util.spec_from_file_location('isolation_integrations',ROOT/'scripts/releases/v1.4.2.0/integrations.py')
x=importlib.util.module_from_spec(spec);spec.loader.exec_module(x)
CONFIG=json.loads((ROOT/'scripts/releases/v1.4.2.0/release-config.json').read_text())

class IsolationTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);d.configure(self.root,CONFIG)
  self.backup=self.root/'private-backup';self.backup.mkdir();self.services={name:{'tag':'synthetic-'+name}for name in ['calendar-app','garyhub-lab']};self.calls=[]
 def tearDown(self):
  if d.LOG:d.LOG.close();d.LOG=None
  self.tmp.cleanup()
 def command(self,args,check=True):
  args=[str(x)for x in args];self.calls.append(args);status=0;out=b''
  if args[:2]==['docker','inspect']:status=1
  if '/app/scripts/publish-hub-release.js'in args:
   count=sum('/app/scripts/publish-hub-release.js'in cmd for cmd in self.calls)
   out=json.dumps({'recipients':5,'alreadyPublished':count==2}).encode()
  return subprocess.CompletedProcess(args,status,out,b'')
 def test_real_command_path_uses_release_fixture_origins_and_synthetic_mounts(self):
  with patch.object(d,'run',side_effect=self.command),patch.object(d,'health')as health:
   d.validate_apps(self.services,self.backup)
  launches=[c for c in self.calls if c[:3]==['docker','run','-d']];self.assertEqual(len(launches),2)
  for cmd in launches:
   env=dict(cmd[i+1].split('=',1)for i,arg in enumerate(cmd)if arg=='-e')
   self.assertIn('http://calendar-check:3000',env['TRUSTED_ORIGINS'].split(','))
   self.assertNotIn('*',env['TRUSTED_ORIGINS']);self.assertNotIn('https://evil.invalid',env['TRUSTED_ORIGINS'])
   mounts=[cmd[i+1]for i,arg in enumerate(cmd)if arg=='-v']
   self.assertTrue(all(value.startswith(str(self.root))for value in mounts))
  self.assertEqual(health.call_count,2)
  self.assertEqual([c[-1]for c in self.calls if c[:2]==['docker','exec']and c[-1].startswith('/checks/')],['/checks/'+name for name in CONFIG['isolation_checks']])
  self.assertFalse(any(c[:2]in [['docker','compose'],['docker','stop']]for c in self.calls))
 def test_each_failed_test_stops_later_checks_and_cleans_only_synthetic_resources(self):
  for failed in ['seed.cjs',*CONFIG['isolation_checks'],'publish-hub-release.js']:
   with self.subTest(failed=failed):
    self.calls=[];target=self.backup/failed;target.mkdir()
    def command(args,check=True):
     result=self.command(args,check)
     if any(str(x).endswith('/'+failed)for x in args):
      return subprocess.CompletedProcess(args,1,b'',b"AssertionError [ERR_ASSERTION]\n  actual: 403,\n  expected: 200,\n at login (/checks/features-http.cjs:7:392)\nAuthorization: private-sentinel-token\n")
     return result
    with patch.object(d,'run',side_effect=command),patch.object(d,'health'),patch.object(d,'say')as say:
     with self.assertRaisesRegex(RuntimeError,'Isolated check failed:')as error:d.validate_apps(self.services,target)
    self.assertIn('actual=403; expected=200',str(error.exception));self.assertNotIn('private-sentinel',str(error.exception))
    self.assertIn(['docker','rm','-f','garyhub-v1420-lab-check','garyhub-v1420-calendar-check'],self.calls)
    self.assertEqual(self.calls[-1],['docker','network','rm','garyhub-v1420-check'])
    self.assertFalse(any(c[:2]in [['docker','compose'],['docker','stop']]for c in self.calls))
    self.assertNotIn('private-sentinel',str(say.call_args_list))
    failure_index=next(i for i,c in enumerate(self.calls)if any(x.endswith('/'+failed)for x in c))
    self.assertTrue(all(c[:2]in [['docker','logs'],['docker','rm'],['docker','network']]for c in self.calls[failure_index+1:]))
 def test_startup_failure_captures_private_logs_before_cleanup(self):
  with patch.object(d,'run',side_effect=self.command),patch.object(d,'health',side_effect=RuntimeError('private-sentinel')):
   with self.assertRaisesRegex(RuntimeError,'Calendar startup health')as error:d.validate_apps(self.services,self.backup)
  self.assertNotIn('private-sentinel',str(error.exception))
  logs=[i for i,c in enumerate(self.calls)if c[:2]==['docker','logs']];cleanup=next(i for i,c in enumerate(self.calls)if c[:2]==['docker','rm'])
  self.assertEqual(len(logs),2);self.assertLess(max(logs),cleanup)
 def test_existing_test_container_is_never_deleted_automatically(self):
  with patch.object(d,'run',return_value=subprocess.CompletedProcess([],0,b'',b''))as run:
   with self.assertRaisesRegex(RuntimeError,'earlier isolated test container'):d.validate_apps(self.services,self.backup)
  self.assertEqual(run.call_count,1)
 def test_diagnostics_allow_only_fixed_codes_primitive_assertions_and_test_locations(self):
  text=b"MODULE_NOT_FOUND private-token-sentinel\n  actual: 'secret',\n  expected: 200,\n /checks/features-http.cjs:7:392\n request body: private-body-sentinel\nSQLITE_ERROR: no such table: reading_links\n"
  result=d.safe_diagnostic(subprocess.CompletedProcess([],1,b'',text))
  self.assertIn('MODULE_NOT_FOUND',result);self.assertIn('expected=200',result);self.assertIn('features-http.cjs:7:392',result)
  self.assertNotIn('secret',result);self.assertNotIn('sentinel',result);self.assertNotIn('reading_links',result)
 def test_private_log_retains_failed_output_but_console_does_not(self):
  d.LOG=(self.backup/'execution.log').open('a+');output=io.StringIO()
  result=subprocess.CompletedProcess([],9,b'private-body-sentinel',b'ERR_ASSERTION\nactual: 403,\nexpected: 200,\n')
  with patch.object(d.subprocess,'run',return_value=result),contextlib.redirect_stdout(output):
   with self.assertRaisesRegex(RuntimeError,'features-http.cjs')as error:d.isolated_step('features-http.cjs',['docker','exec','synthetic-only'])
  self.assertIn('Private log: ',str(error.exception));self.assertNotIn('private-body-sentinel',str(error.exception)+output.getvalue())
  d.LOG.seek(0);self.assertIn('private-body-sentinel',d.LOG.read())
 def test_reading_validation_keeps_acceptance_and_account_checks_with_cleanup(self):
  x.install(d);state={'integrations':{'postgres_data_path':'/var/lib/postgresql/data','postgres_image':'synthetic-postgres','miniflux':{'old_image_id':'synthetic-miniflux'}},'services':self.services}
  def command(args,check=True):
   result=self.command(args,check)
   if 'psql'in args:result.stdout=b'2'
   return result
  with patch.object(d,'run',side_effect=command),patch.object(d,'jr',return_value=[{'IPAM':{'Config':[{'Subnet':'172.19.0.0/16'}]}}]):
   d.HOOKS['validate'](state)
  self.assertTrue(any('/checks/miniflux-acceptance.cjs'in c for c in self.calls))
  self.assertTrue(any('psql'in c for c in self.calls))
  self.assertEqual(self.calls[-2:], [['docker','rm','-fv','garyhub142-reading-check-mf','garyhub142-reading-check-db'],['docker','network','rm','garyhub142-reading-check-net']])
 def test_reading_acceptance_failure_keeps_logs_and_does_not_continue(self):
  x.install(d);state={'integrations':{'postgres_data_path':'/var/lib/postgresql/data','postgres_image':'synthetic-postgres','miniflux':{'old_image_id':'synthetic-miniflux'}},'services':self.services}
  def command(args,check=True):
   result=self.command(args,check)
   if '/checks/miniflux-acceptance.cjs'in args:result.returncode=1;result.stderr=b'ERR_ASSERTION'
   return result
  with patch.object(d,'run',side_effect=command),patch.object(d,'jr',return_value=[{'IPAM':{'Config':[{'Subnet':'172.19.0.0/16'}]}}]):
   with self.assertRaisesRegex(RuntimeError,'miniflux-acceptance.cjs'):d.HOOKS['validate'](state)
  self.assertFalse(any('psql'in c for c in self.calls));self.assertEqual(sum(c[:2]==['docker','logs']for c in self.calls),2)
  self.assertEqual(self.calls[-1],['docker','network','rm','garyhub142-reading-check-net'])

if __name__=='__main__':unittest.main()
