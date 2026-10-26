"""Regress the r1 Calendar-only preload accidentally injected into Lab."""
import importlib.util,json,os,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[4]
spec=importlib.util.spec_from_file_location('isolation_regression',ROOT/'scripts/updater/deploy_runtime.py')
d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
CONFIG=json.loads((ROOT/'scripts/releases/v1.4.3.0/release-config.json').read_text())
class IsolationEnvironmentTests(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);d.configure(self.root,CONFIG)
 def tearDown(self):self.tmp.cleanup()
 def test_only_calendar_receives_the_mock_and_synthetic_r2_credentials(self):
  cal=d.isolation_environment('calendar-app');lab=d.isolation_environment('garyhub-lab')
  self.assertEqual(cal['NODE_OPTIONS'],'--require /checks/fake-r2.cjs');self.assertIn('R2_ACCOUNT_ID',cal)
  self.assertNotIn('NODE_OPTIONS',lab);self.assertFalse(any(k.startswith('R2_') for k in lab));self.assertEqual(lab['TRUSTED_ORIGINS'],cal['TRUSTED_ORIGINS'])
 def test_actual_container_arguments_keep_lab_without_data_dir_or_preload(self):
  commands={};backup=self.root/'backup';backup.mkdir()
  def step(label,args):
   commands[label]=args
   if label=='start synthetic Tools/Lab':raise RuntimeError('Synthetic stop after capturing startup arguments')
   return subprocess.CompletedProcess(args,0,b'',b'')
  def run(args,*unused):return subprocess.CompletedProcess(args,1 if args[:2]==['docker','inspect'] else 0,b'',b'')
  with patch.object(d,'isolated_step',side_effect=step),patch.object(d,'run',side_effect=run),patch.object(d,'health'):
   with self.assertRaisesRegex(RuntimeError,'start synthetic Tools/Lab'):d.validate_apps({'calendar-app':{'tag':'synthetic-calendar'},'garyhub-lab':{'tag':'synthetic-lab'}},backup)
  def values(args):return dict(args[i+1].split('=',1) for i,x in enumerate(args) if x=='-e')
  cal=values(commands['start synthetic Calendar']);lab=values(commands['start synthetic Tools/Lab'])
  self.assertEqual(cal['DATA_DIR'],'/app/data');self.assertIn('NODE_OPTIONS',cal);self.assertEqual(lab['LAB_DATA_DIR'],'/check-lab')
  self.assertNotIn('DATA_DIR',lab);self.assertNotIn('NODE_OPTIONS',lab);self.assertFalse(any(k.startswith('R2_') for k in lab))
 def test_legacy_common_environment_is_unchanged(self):
  legacy=json.loads((ROOT/'scripts/releases/v1.4.2.0/release-config.json').read_text());d.configure(self.root,legacy)
  for service in ['calendar-app','garyhub-lab']:self.assertEqual(d.isolation_environment(service),legacy['isolation_environment'])
 def test_invalid_service_scopes_and_environment_entries_are_rejected(self):
  for changes in [{'isolation_service_environment':{'misspelled-service':{}}},{'isolation_service_environment':{'calendar-app':{'bad-key':'x'}}},{'isolation_service_environment':{'calendar-app':{'GOOD':123}}}]:
   d.configure(self.root,{**CONFIG,**changes})
   with self.assertRaises(RuntimeError):d.isolation_environment('garyhub-lab')
 def test_the_original_failure_is_reproduced_without_calendar_data_dir(self):
  env={k:v for k,v in os.environ.items() if k not in {'NODE_OPTIONS','DATA_DIR'}}
  env['NODE_OPTIONS']='--require '+str(ROOT/'scripts/releases/v1.4.3.0/tests/fake-r2.cjs')
  result=subprocess.run([os.environ.get('GARYHUB_TEST_NODE','node'),'-e',"process.stdout.write('unexpected startup')"],env=env,capture_output=True,text=True,timeout=10)
  self.assertNotEqual(result.returncode,0);self.assertIn('ERR_INVALID_ARG_TYPE',result.stderr);self.assertIn('fake-r2.cjs:5:35',result.stderr);self.assertNotIn('unexpected startup',result.stdout)
 def test_type_error_diagnostic_does_not_print_arbitrary_message_content(self):
  log=b'TypeError [ERR_INVALID_ARG_TYPE]: synthetic-private-value\n at Object.<anonymous> (/checks/fake-r2.cjs:5:35)'
  result=d.safe_diagnostic(subprocess.CompletedProcess([],1,b'',log))
  self.assertIn('ERR_INVALID_ARG_TYPE',result);self.assertIn('fake-r2.cjs:5:35',result);self.assertNotIn('synthetic-private-value',result)
if __name__=='__main__':unittest.main()
