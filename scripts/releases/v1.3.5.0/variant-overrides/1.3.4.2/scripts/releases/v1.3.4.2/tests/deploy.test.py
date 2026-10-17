import importlib.util,tempfile,unittest
from pathlib import Path
base=Path(__file__).parents[1];target=base/'deploy.py' if (base/'deploy.py').exists() else base/'package/deploy.py'
spec=importlib.util.spec_from_file_location('deploy',target);d=importlib.util.module_from_spec(spec);spec.loader.exec_module(d)
class DeploymentTests(unittest.TestCase):
 def test_caddy_only_home_changes(self):
  old='''# stable\ncalendar.garyhub.uk {\n reverse_proxy calendar-app:3000\n}\ngaryhub.uk {\n @legacy path /study/*\n handle @legacy { respond "Gone" 410 }\n handle { root * /srv\n file_server }\n}\nvpn.garyhub.uk {\n reverse_proxy localhost:18080\n}\n'''
  new=d.caddy_home(old)
  self.assertIn('reverse_proxy garyhub-lab:3000',new)
  self.assertEqual(new.split('garyhub.uk {')[0],old.split('garyhub.uk {')[0])
  self.assertEqual(new.split('vpn.garyhub.uk')[1],old.split('vpn.garyhub.uk')[1])
 def test_caddy_quotes_comments(self):
  old='garyhub.uk {\n # { braces in comment\n respond "a } string"\n}\nother.example { respond "ok" }'
  self.assertTrue(d.caddy_home(old).endswith('other.example { respond "ok" }'))
 def test_unexpected_home_stops(self):
  for s in ['other.example { respond "ok" }','garyhub.uk {','garyhub.uk {}\ngaryhub.uk {}']:
   with self.assertRaises(RuntimeError):d.caddy_home(s)
 def test_snapshot_and_refuse_overwrite(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp);db=d.sqlite3.connect(p/'source.sqlite');db.execute('create table x(id integer)');db.execute('insert into x values(7)');db.commit();d.snapshot(p/'source.sqlite',p/'copy.sqlite');b=d.sqlite3.connect(p/'copy.sqlite');self.assertEqual(b.execute('select id from x').fetchone()[0],7);b.close()
   with self.assertRaises(RuntimeError):d.snapshot(p/'source.sqlite',p/'copy.sqlite')
   db.close()
 def test_byte_verified_lab_backup(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp);(p/'data/sub').mkdir(parents=True);(p/'data/sub/u.json').write_text('{"revision":3}');r=d.backup_lab(p/'data',p/'backup.tar.gz');self.assertTrue(r['verified']);self.assertEqual(r['files'],1)
 def test_rollback_keeps_databases_and_config_guard(self):
  with tempfile.TemporaryDirectory() as tmp:
   p=Path(tmp);(p/'Caddyfile').write_text('original');(p/'active.json').write_text('{"old":true}');(p/'calendar.sqlite').write_bytes(b'new transactions');calls=[]
   old=(d.old_up,d.health,d.set_caddy,d.ACTIVE,d.STATE)
   try:
    d.old_up=lambda c:calls.append(c['name']);d.health=lambda name:None;d.set_caddy=lambda path,text:calls.append(text);d.ACTIVE=p/'active';d.STATE=p/'state.json';s={'backup':tmp,'old_active_exists':True,'caddy_path':str(p/'live'),'services':{n:{'name':n}for n in ['calendar-app','garyhub-lab']}}
    d.restore(s);self.assertEqual((p/'calendar.sqlite').read_bytes(),b'new transactions');self.assertEqual(calls,['calendar-app','garyhub-lab']);self.assertEqual(s['status'],'rolled-back')
   finally:d.old_up,d.health,d.set_caddy,d.ACTIVE,d.STATE=old
 def test_downgrade_blocks_pending_account_operations(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'calendar.sqlite';db=d.sqlite3.connect(p);db.execute('CREATE TABLE users(id INTEGER,enabled INTEGER,deletion_pending INTEGER,must_change_password INTEGER)');db.execute('INSERT INTO users VALUES(1,1,0,0)');db.commit();d.check_downgrade(p)
   db.execute('UPDATE users SET deletion_pending=1');db.commit()
   with self.assertRaisesRegex(RuntimeError,'deletion'):d.check_downgrade(p)
   db.execute('UPDATE users SET deletion_pending=0,must_change_password=1');db.commit()
   with self.assertRaisesRegex(RuntimeError,'password'):d.check_downgrade(p)
   db.execute('UPDATE users SET enabled=0');db.commit();d.check_downgrade(p);db.close()
 def test_downgrade_accepts_pre_migration_database(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp)/'calendar.sqlite';db=d.sqlite3.connect(p);db.execute('CREATE TABLE users(id INTEGER,enabled INTEGER)');db.commit();db.close();d.check_downgrade(p)
 def test_overlay_inherits_private_files_and_never_regenerates(self):
  src=target.read_text();self.assertNotIn('RUN node /lab/homepage-privacy.cjs /lab',src);self.assertIn('new_caddy=old_caddy',src);self.assertIn('check_downgrade',src)


 def test_key_generation_persistence_and_private_backup(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp);data=p/'data';data.mkdir();backup=p/'backup';backup.mkdir();db=d.sqlite3.connect(data/'calendar.sqlite');db.execute('CREATE TABLE users(username TEXT)');db.executemany('INSERT INTO users VALUES(?)',[('Gary_BANG',),('zhouyoyo',)]);db.commit();db.close();service={}
   d.prepare_totp_key(service,data,backup,p/'private');key=service['environment']['GARYHUB_TOTP_ENCRYPTION_KEY'];self.assertEqual(len(d.base64.b64decode(key)),32);self.assertEqual((backup/'totp-key.env').read_text(),(p/'private/garyhub-totp.env').read_text());self.assertEqual((p/'private/garyhub-totp.env').stat().st_mode&0o777,0o600)
   second=p/'backup2';second.mkdir();new={};d.prepare_totp_key(new,data,second,p/'private');self.assertEqual(new['environment']['GARYHUB_TOTP_ENCRYPTION_KEY'],key)
 def test_wrong_or_missing_key_never_overwrites_encrypted_entries(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp);data=p/'data';data.mkdir();backup=p/'backup';backup.mkdir();db=d.sqlite3.connect(data/'calendar.sqlite');db.execute('CREATE TABLE users(username TEXT)');db.executemany('INSERT INTO users VALUES(?)',[('Gary_BANG',),('zhouyoyo',)]);db.execute('CREATE TABLE totp_entries(key_id TEXT)');db.execute("INSERT INTO totp_entries VALUES('unexpected-key')");db.commit();db.close()
   with self.assertRaisesRegex(RuntimeError,'key is missing'):d.prepare_totp_key({},data,backup,p/'private')
   self.assertFalse((p/'private/garyhub-totp.env').exists())
   with self.assertRaisesRegex(RuntimeError,'does not match'):d.prepare_totp_key({'environment':{'GARYHUB_TOTP_ENCRYPTION_KEY':d.base64.b64encode(bytes(32)).decode()}},data,backup,p/'private')
   self.assertFalse((p/'private/garyhub-totp.env').exists())
 def test_missing_seed_identity_stops_before_key_or_service_mutation(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp);data=p/'data';data.mkdir();backup=p/'backup';backup.mkdir();db=d.sqlite3.connect(data/'calendar.sqlite');db.execute('CREATE TABLE users(username TEXT)');db.execute("INSERT INTO users VALUES('Gary_BANG')");db.commit();db.close()
   with self.assertRaisesRegex(RuntimeError,'subscriber account is missing'):d.prepare_totp_key({},data,backup,p/'private')
   self.assertFalse((p/'private').exists())
 def test_active_deployment_must_match_actual_image_and_effective_compose(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp);config=p/'compose.json';config.write_text('{}');active=p/'active.json';active.write_text(d.json.dumps({'services':{'calendar-app':{'new_image_id':'sha:good','new_config':str(config)}}}));old=d.ACTIVE;d.ACTIVE=active
   try:
    live={'calendar-app':{'Image':'sha:good','Config':{'Labels':{'com.docker.compose.project.config_files':str(config)}}}};d.check_active(live);live['calendar-app']['Image']='sha:changed'
    with self.assertRaisesRegex(RuntimeError,'does not match'):d.check_active(live)
   finally:d.ACTIVE=old


 def test_notification_failure_keeps_deployment_pending(self):
  with tempfile.TemporaryDirectory()as tmp:
   old=d.STATE,d.jr;d.STATE=Path(tmp)/'state.json';d.jr=lambda args:(_ for _ in ()).throw(RuntimeError('synthetic publication failure'))
   try:
    state={'status':'cutover'}
    with self.assertRaisesRegex(RuntimeError,'notification publication is pending'):d.finish(state)
    self.assertEqual(d.json.loads(d.STATE.read_text())['status'],'notification-pending')
   finally:d.STATE,d.jr=old
 def test_completed_retry_does_not_redeploy_or_republish(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp);(p/'backup').mkdir();state={'status':'complete','backup':str(p/'backup'),'services':{'calendar-app':{'name':'calendar-app','new_image_id':'image:cal'},'garyhub-lab':{'name':'garyhub-lab','new_image_id':'image:lab'}}};(p/'state.json').write_text(d.json.dumps(state));old=d.STATE,d.LOCK,d.LOG,d.image,d.health,d.verify_https,d.finish
   try:
    d.STATE=p/'state.json';d.LOCK=p/'lock';d.image=lambda name:{'Image':'image:cal'if name=='calendar-app'else'image:lab'};d.health=lambda *a:None;d.verify_https=lambda:None;d.finish=lambda s:(_ for _ in ()).throw(AssertionError('republished'));d.main();self.assertEqual(d.json.loads(d.STATE.read_text())['status'],'complete')
   finally:
    if d.LOG:d.LOG.close()
    d.STATE,d.LOCK,d.LOG,d.image,d.health,d.verify_https,d.finish=old
 def test_notification_retry_only_runs_publication(self):
  with tempfile.TemporaryDirectory()as tmp:
   p=Path(tmp);(p/'backup').mkdir();state={'status':'notification-pending','backup':str(p/'backup'),'services':{'calendar-app':{'name':'calendar-app','new_image_id':'image:cal'}}};(p/'state.json').write_text(d.json.dumps(state));old=d.STATE,d.LOCK,d.LOG,d.image,d.health,d.verify_https,d.finish;calls=[]
   try:
    d.STATE=p/'state.json';d.LOCK=p/'lock';d.image=lambda name:{'Image':'image:cal'};d.health=lambda *a:None;d.verify_https=lambda:None;d.finish=lambda s:calls.append(s['status']);d.main();self.assertEqual(calls,['notification-pending'])
   finally:
    if d.LOG:d.LOG.close()
    d.STATE,d.LOCK,d.LOG,d.image,d.health,d.verify_https,d.finish=old
if __name__=='__main__':unittest.main()
