"""Synthetic checks for the new adapter and private R2 configuration helper."""
import importlib.util,json,os,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[4]
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
adapter=load('deploy143',ROOT/'scripts/releases/v1.4.3.0/deploy.py')
setup=load('setup143',ROOT/'scripts/releases/v1.4.3.0/configure-r2.py')
class MusicDeploymentTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  self.config={'R2_ACCOUNT_ID':'a'*32,'R2_BUCKET':'music-fixture','R2_ACCESS_KEY_ID':'b'*32,'R2_SECRET_ACCESS_KEY':'c'*64}
  self.target=self.root/'music-r2.env';self.target.write_text('');self.active=self.root/'active.json';self.active.write_text(json.dumps({'services':{'calendar-app':{'new_image_id':'reviewed'}}}))
  self.inspect=[{'Image':'reviewed','Mounts':[{'Source':str(self.target),'Destination':'/run/garyhub-music.env','RW':False}]}]
  self.patches=[patch.object(setup,'CONFIG_FILE',self.target),patch.object(setup,'ACTIVE_FILE',self.active),patch.object(setup,'LOCK_FILE',self.root/'lock')]
  for p in self.patches:p.start()
 def tearDown(self):
  for p in self.patches:p.stop()
  self.temp.cleanup()
 def test_private_mount_is_added_without_changing_existing_settings_or_file_bytes(self):
  path=self.root/'private/music-r2.env';path.parent.mkdir();path.write_text('synthetic-private-content');configs={'calendar-app':{'services':{'calendar':{'environment':{'EXISTING':'kept'},'volumes':[]}}}}
  with patch.object(adapter,'CONFIG_FILE',path):adapter.prepare({'services':{'calendar-app':{'service':'calendar'}}},configs,None,None)
  self.assertEqual(path.read_text(),'synthetic-private-content');self.assertEqual(path.stat().st_mode&0o777,0o600)
  service=configs['calendar-app']['services']['calendar'];self.assertEqual(service['environment']['EXISTING'],'kept');self.assertTrue(service['volumes'][0]['read_only'])
 def test_symlink_config_refuses_before_mutation(self):
  linked=self.root/'linked.env';linked.symlink_to(self.target)
  with patch.object(adapter,'CONFIG_FILE',linked),self.assertRaisesRegex(RuntimeError,'symlink'):adapter.prepare({},None,None,None)
 def test_setup_keeps_mounted_inode_and_checks_remote_storage(self):
  inode=self.target.stat().st_ino
  with patch.object(setup.subprocess,'run',side_effect=[subprocess.CompletedProcess([],0,b'1.4.3.0'),subprocess.CompletedProcess([],0)]),patch.object(setup.subprocess,'check_output',return_value=json.dumps(self.inspect).encode()):setup.configure(self.config)
  self.assertEqual(self.target.stat().st_ino,inode);self.assertEqual(self.target.stat().st_mode&0o777,0o600);self.assertIn('R2_BUCKET=music-fixture',self.target.read_text())
 def test_failed_real_check_restores_exact_previous_configuration(self):
  previous='R2_BUCKET=music-fixture\nR2_ACCOUNT_ID='+'a'*32+'\n';self.target.write_text(previous)
  with patch.object(setup.subprocess,'run',side_effect=[subprocess.CompletedProcess([],0,b'1.4.3.0'),subprocess.CompletedProcess([],1)]),patch.object(setup.subprocess,'check_output',return_value=json.dumps(self.inspect).encode()),self.assertRaisesRegex(RuntimeError,'previous configuration was restored'):setup.configure(self.config)
  self.assertEqual(self.target.read_text(),previous)
 def test_wrong_version_does_not_write_credentials(self):
  with patch.object(setup.subprocess,'run',return_value=subprocess.CompletedProcess([],0,b'1.4.2.0')),self.assertRaisesRegex(RuntimeError,'Install v1.4.3.0'):setup.configure(self.config)
  self.assertEqual(self.target.read_text(),'')
 def test_bucket_switch_with_existing_objects_is_refused(self):
  previous='R2_ACCOUNT_ID='+'a'*32+'\nR2_BUCKET=old-bucket\n';self.target.write_text(previous)
  with patch.object(setup.subprocess,'run',side_effect=[subprocess.CompletedProcess([],0,b'1.4.3.0'),subprocess.CompletedProcess([],0,b'1')]),patch.object(setup.subprocess,'check_output',return_value=json.dumps(self.inspect).encode()),self.assertRaisesRegex(RuntimeError,'migrate it before changing storage'):setup.configure(self.config)
  self.assertEqual(self.target.read_text(),previous)
 def test_new_adapter_checks_live_base_version_before_building(self):
  d=adapter.d;d.configure(self.root,adapter.CONFIG)
  (self.root/'manifest.json').write_text(json.dumps({'release':'v1.4.3.0','requires_release':'1.4.2.0','installer_build':adapter.CONFIG['installer_build'],'files':{}}))
  try:
   with patch.object(d,'image',return_value={}),patch.object(d,'jr',side_effect=['1.4.1.0','1.4.1.0']),patch.object(d,'run') as run:
    with self.assertRaisesRegex(RuntimeError,'requires both services to be deployed v1.4.2.0'):d.locked_main()
    run.assert_not_called()
  finally:
   if d.LOG:d.LOG.close();d.LOG=None
if __name__=='__main__':unittest.main()
