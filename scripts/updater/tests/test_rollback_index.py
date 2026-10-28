"""Stateful Docker-label fixtures for rollback -> metadata recovery -> retry.

The old-up fixture records the actual -f snapshot path in container labels,
unlike the previous image-only rollback mocks which missed this failure.
"""
import copy,hashlib,importlib.util,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch

ROOT=Path(__file__).resolve().parents[3]
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,file);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
d=load('rollback_index_runtime',ROOT/'scripts/updater/deploy_runtime.py')
recovery=load('rollback_index_recovery',ROOT/'scripts/releases/v1.4.3.1/rollback_recovery.py')

class RollbackIndexTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
  self.prior=self.root/'r1';self.backup=self.prior/'private-backup/20261027T230000Z';self.backup.mkdir(parents=True)
  self.current=self.root/'r3';self.current.mkdir();self.active=self.root/'active.json';self.caddy=self.root/'Caddyfile';self.caddy.write_text('synthetic caddy\n');(self.backup/'Caddyfile').write_bytes(self.caddy.read_bytes())
  self.index={'release':'v1.4.3.0','reading_release':'1.4.2.0','subscription_music_release':'1.4.3.0','services':{}}
  self.state={'release':'v1.4.3.1','version':'1.4.3.1','requires_release':'1.4.3.0','status':'rolled-back','backup':str(self.backup),'old_active_exists':True,'caddy_path':str(self.caddy),'services':{}}
  self.lives={}
  for name in ['calendar-app','garyhub-lab']:
   project='project-'+name;service='web-'+name;config=self.root/(name+'-original.json');snapshot=self.backup/(service+'-old.json');old='sha256:old-'+name;new='sha256:new-'+name
   content={'services':{service:{'image':'original-tag','environment':{'EXISTING':'synthetic-only'},'volumes':[{'type':'bind','source':'/synthetic/current-records','target':'/app/data'}]},'unrelated':{'image':'preserved'}},'networks':{'reading':{'external':True}}}
   config.write_text(json.dumps(content));saved=copy.deepcopy(content);saved['services'][service].update(image=old,pull_policy='never');snapshot.write_text(json.dumps(saved))
   self.index['services'][name]={'project':project,'service':service,'new_config':str(config),'new_image_id':old,'old_config':'historical-pointer'}
   self.state['services'][name]={'name':name,'project':project,'service':service,'old_config':str(snapshot),'new_config':str(self.prior/(service+'-compose.json')),'old_image_id':old,'new_image_id':new}
   self.old_up(self.state['services'][name])
  self.active.write_text(json.dumps(self.index));(self.backup/'active.json').write_bytes(self.active.read_bytes());self.write_state()
  manifest=self.prior/'manifest.json';manifest.write_text('{"installer_build":"v1.4.3.1-r1"}')
  self.spec={'root':str(self.prior),'manifest_sha256':d.sha(manifest)}
  self.config=json.loads((ROOT/'scripts/releases/v1.4.3.1/release-config.json').read_text());d.configure(self.current,self.config)
  self.patches=[patch.object(d,'ACTIVE',self.active),patch.object(d,'image',side_effect=lambda name:copy.deepcopy(self.lives[name])),patch.object(d,'jr',side_effect=self.compose)]
  for item in self.patches:item.start()
 def tearDown(self):
  for item in reversed(self.patches):item.stop()
  self.temp.cleanup()
 def write_state(self):(self.prior/'deployment-state.json').write_text(json.dumps(self.state))
 def old_up(self,c):
  self.lives[c['name']]={'Image':c['old_image_id'],'State':{'Running':True},'Config':{'Labels':{'com.docker.compose.project':c['project'],'com.docker.compose.service':c['service'],'com.docker.compose.project.config_files':c['old_config']}}}
 @staticmethod
 def compose(args):
  if args[:2]!=['docker','compose'] or args[-3:]!=['config','--format','json']:raise AssertionError('Unexpected fixture command')
  return json.loads(Path(args[args.index('-f')+1]).read_text())
 def install_recovery(self):d.HOOKS['reconcile_active']=lambda lives:recovery.reconcile(d,lives,self.spec)
 def assert_refuses_without_index_mutation(self,pattern='Rollback recovery'):
  before=self.active.read_bytes();self.install_recovery()
  with self.assertRaisesRegex(RuntimeError,pattern):d.check_active(self.lives)
  self.assertEqual(self.active.read_bytes(),before);self.assertFalse((self.current/'rollback-index-recovery.json').exists())
 def test_exact_user_failure_is_reproduced_then_repaired_and_retry_is_idempotent(self):
  with self.assertRaisesRegex(RuntimeError,'Effective Compose does not match'):d.check_active(self.lives)
  containers=copy.deepcopy(self.lives);files={p:p.read_bytes() for p in self.backup.glob('*-old.json')};self.install_recovery();d.check_active(self.lives)
  actual=json.loads(self.active.read_text());self.assertEqual(actual['release'],'v1.4.3.0');self.assertEqual(actual['reading_release'],'1.4.2.0')
  for name,c in self.state['services'].items():self.assertEqual(actual['services'][name]['new_config'],c['old_config'])
  self.assertEqual(self.lives,containers);self.assertEqual({p:p.read_bytes() for p in files},files)
  stamp=self.active.stat().st_mtime_ns;d.check_active(self.lives);self.assertEqual(self.active.stat().st_mtime_ns,stamp)
  self.assertEqual((self.current/'rollback-index-recovery.json').stat().st_mode&0o777,0o600)
 def test_future_automatic_rollback_then_strict_preflight_succeeds(self):
  for name,c in self.state['services'].items():self.lives[name]['Image']=c['new_image_id']
  records=self.root/'current-records';records.write_bytes(b'user records added after installation')
  with patch.object(d,'old_up',side_effect=self.old_up),patch.object(d,'health'):
   d.restore(self.state)
  self.assertEqual(records.read_bytes(),b'user records added after installation');d.check_active(self.lives)
  self.assertEqual(self.state['status'],'rolled-back');self.assertEqual(self.state['rollback_active_sha'],d.sha(self.active))
 def test_future_manual_rollback_then_strict_preflight_succeeds(self):
  for name,c in self.state['services'].items():self.lives[name]['Image']=c['new_image_id']
  self.state.update(active_sha=d.sha(self.active),caddy_sha=d.sha(self.caddy))
  with patch.object(d,'old_up',side_effect=self.old_up),patch.object(d,'health'):d.restore(self.state,True)
  d.check_active(self.lives)
 def test_later_image_is_rejected_before_index_write(self):
  self.lives['garyhub-lab']['Image']='sha256:later';self.assert_refuses_without_index_mutation()
 def test_changed_project_or_effective_path_is_rejected(self):
  self.lives['calendar-app']['Config']['Labels']['com.docker.compose.project']='later-project';self.assert_refuses_without_index_mutation()
 def test_unrecorded_active_index_change_is_preserved(self):
  self.active.write_text(self.active.read_text()+'\n');self.assert_refuses_without_index_mutation('active index changed')
 def test_resolved_environment_or_mount_change_is_rejected(self):
  c=self.state['services']['calendar-app'];p=Path(c['old_config']);value=json.loads(p.read_text());value['services'][c['service']]['environment']['EXISTING']='later-change';p.write_text(json.dumps(value));self.assert_refuses_without_index_mutation('configuration content changed')
 def test_unknown_package_or_state_status_is_rejected(self):
  (self.prior/'manifest.json').write_text('{}');self.assert_refuses_without_index_mutation('unrecognized r1 package')
 def test_incomplete_rollback_is_not_reconciled(self):
  self.state['status']='rollback-failed';self.write_state();self.assert_refuses_without_index_mutation('completed known rollback')
 def test_symlink_evidence_is_rejected(self):
  file=Path(self.state['services']['calendar-app']['old_config']);actual=file.with_suffix('.saved');file.rename(actual);file.symlink_to(actual);self.assert_refuses_without_index_mutation('regular, unlinked')
 def test_changed_caddy_is_not_overwritten_or_adopted(self):
  self.caddy.write_text('changed by a later operation');self.assert_refuses_without_index_mutation('Caddy changed')
 def test_audit_can_resume_an_interrupted_index_write(self):
  original_write=d.write
  def interrupted(path,value):
   if Path(path)==self.active:raise OSError('synthetic interruption before index write')
   return original_write(path,value)
  self.install_recovery()
  with patch.object(d,'write',side_effect=interrupted),self.assertRaises(OSError):d.check_active(self.lives)
  self.assertTrue((self.current/'rollback-index-recovery.json').is_file());d.check_active(self.lives);d._check_active(json.loads(self.active.read_text()),self.lives)
 def test_future_rollback_does_not_publish_an_index_for_an_unexpected_container(self):
  before=self.active.read_bytes()
  for name,c in self.state['services'].items():self.lives[name]['Image']=c['new_image_id']
  def wrong_labels(c):
   self.old_up(c);self.lives[c['name']]['Config']['Labels']['com.docker.compose.project.config_files']='unexpected-config'
  with patch.object(d,'old_up',side_effect=wrong_labels),patch.object(d,'health'),self.assertRaisesRegex(RuntimeError,'recorded rollback configuration'):d.restore(self.state)
  self.assertEqual(self.active.read_bytes(),before)
 def test_container_change_during_recovery_is_not_adopted(self):
  def changed(name):
   value=copy.deepcopy(self.lives[name]);value['Image']='sha256:changed-during-check';return value
  with patch.object(d,'image',side_effect=changed):self.assert_refuses_without_index_mutation('container changed during verification')
 def test_missing_rollback_record_does_not_weaken_the_existing_guard(self):
  (self.prior/'deployment-state.json').unlink();self.assert_refuses_without_index_mutation('regular, unlinked')

if __name__=='__main__':unittest.main()
