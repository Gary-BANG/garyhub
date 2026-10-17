import importlib.util,json,sqlite3,tempfile,unittest,hashlib,os
from pathlib import Path
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('deploy',Path(__file__).resolve().parents[1]/'deploy.py');d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
class DeploymentTests(unittest.TestCase):
 def setUp(self):self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
 def tearDown(self):self.tmp.cleanup()
 def database(self):
  p=self.root/'calendar.sqlite'
  with sqlite3.connect(p)as db:
   db.executescript('CREATE TABLE users(id INTEGER PRIMARY KEY,enabled INTEGER,must_change_password INTEGER,deletion_pending INTEGER);INSERT INTO users VALUES(1,1,0,0);CREATE TABLE todo_lists(user_id INTEGER PRIMARY KEY REFERENCES users(id),state TEXT);INSERT INTO todo_lists VALUES(1,\'[{"title":"retained"}]\');')
  return p
 def test_consistent_backup_keeps_current_data_and_refuses_overwrite(self):
  p=self.database();dst=self.root/'copy.sqlite';d.snapshot(p,dst)
  with sqlite3.connect(dst)as db:self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0],'ok');self.assertEqual(db.execute('SELECT state FROM todo_lists').fetchone()[0],'[{"title":"retained"}]')
  with self.assertRaises(RuntimeError):d.snapshot(p,dst)
 def test_lab_archive_is_verified_and_symlinks_stop_backup(self):
  data=self.root/'data';data.mkdir();(data/'user-1.json').write_text('{"private":"synthetic"}');(data/'binary').write_bytes(bytes(range(256)))
  self.assertEqual(d.backup_lab(data,self.root/'lab.tar.gz')['files'],2)
  (data/'link').symlink_to(data/'user-1.json')
  with self.assertRaises(RuntimeError):d.backup_lab(data,self.root/'bad.tar.gz')
 def test_reviewed_sources_normalize_line_endings_but_reject_unknown_content(self):
  (self.root/'app.js').write_bytes(b'known\r\n');h=hashlib.sha256(b'known').hexdigest();self.assertEqual(d.source_mismatches('app',self.root,{'app.js':[h]}),[])
  (self.root/'app.js').write_text('changed');self.assertEqual(d.source_mismatches('app',self.root,{'app.js':[h]})[0]['file'],'app.js')
 def test_active_index_must_match_effective_compose_and_image(self):
  active=self.root/'active.json';cfg=self.root/'config.json';cfg.write_text('{}');active.write_text(json.dumps({'services':{'calendar-app':{'new_image_id':'sha:good','new_config':str(cfg)}}}))
  live={'Image':'sha:good','Config':{'Labels':{'com.docker.compose.project.config_files':str(cfg)}}}
  with patch.object(d,'ACTIVE',active):
   d.check_active({'calendar-app':live});live['Image']='sha:other'
   with self.assertRaises(RuntimeError):d.check_active({'calendar-app':live})
 def test_key_backup_keeps_the_matching_key_and_rejects_a_wrong_key(self):
  p=self.database();raw=bytes(range(32));key=d.base64.b64encode(raw).decode();backup=self.root/'backup';backup.mkdir()
  with sqlite3.connect(p)as db:db.execute('CREATE TABLE totp_entries(key_id TEXT)');db.execute('INSERT INTO totp_entries VALUES(?)',[hashlib.sha256(raw).hexdigest()[:16]])
  d.backup_totp_key({'environment':{'GARYHUB_TOTP_ENCRYPTION_KEY':key}},self.root,backup);self.assertEqual((backup/'totp-key.env').stat().st_mode&0o777,0o600)
  with self.assertRaises(RuntimeError):d.backup_totp_key({'environment':{'GARYHUB_TOTP_ENCRYPTION_KEY':d.base64.b64encode(bytes([99])*32).decode()}},self.root,backup)
 def test_application_rollback_never_restores_an_old_database(self):
  p=self.database();state={'calendar_data':str(self.root),'services':{'calendar-app':{},'garyhub-lab':{}},'old_active_exists':False};active=self.root/'active.json';active.write_text('{}')
  with patch.object(d,'ACTIVE',active),patch.object(d,'STATE',self.root/'state.json'),patch.object(d,'old_up')as up,patch.object(d,'health'):
   d.restore(state);self.assertEqual(up.call_count,2)
  with sqlite3.connect(p)as db:self.assertIn('retained',db.execute('SELECT state FROM todo_lists').fetchone()[0]);db.execute('UPDATE users SET deletion_pending=1')
  with self.assertRaises(RuntimeError):d.check_downgrade(p)
if __name__=='__main__':unittest.main()
