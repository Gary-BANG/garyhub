"""Release-specific base refusal and inherited configuration verification."""
import importlib.util,json,os,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import quote
ROOT=Path(__file__).resolve().parents[4]
spec=importlib.util.spec_from_file_location('deploy1431',ROOT/'scripts/releases/v1.4.3.1/deploy.py');adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
class ReleaseTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);adapter.d.configure(self.root,adapter.CONFIG)
 def tearDown(self):
  if adapter.d.LOG:adapter.d.LOG.close();adapter.d.LOG=None
  self.temp.cleanup()
 def test_live_base_must_match_before_any_build_or_cutover(self):
  for i,versions in enumerate([['1.4.2.0','1.4.2.0'],['1.4.3.0','1.4.2.0']]):
   work=self.root/str(i);work.mkdir();adapter.d.configure(work,adapter.CONFIG)
   (work/'manifest.json').write_text(json.dumps({'release':'v1.4.3.1','requires_release':'1.4.3.0','installer_build':adapter.CONFIG['installer_build'],'files':{}}))
   with patch.object(adapter.d,'image',return_value={}),patch.object(adapter.d,'jr',side_effect=versions),patch.object(adapter.d,'run') as run:
    with self.assertRaisesRegex(RuntimeError,'both services to be deployed v1.4.3.0'):adapter.d.locked_main()
    run.assert_not_called()
   if adapter.d.LOG:adapter.d.LOG.close();adapter.d.LOG=None
 def test_existing_mounts_credentials_and_integration_settings_are_inherited(self):
  live={'Image':'old-image','Name':'/calendar-app','Config':{'Labels':{'com.docker.compose.project':'existing','com.docker.compose.service':'calendar','com.docker.compose.project.config_files':str(self.root/'effective.json')}}}
  (self.root/'effective.json').write_text('{}')
  config={'services':{'calendar':{'image':'old-tag','environment':{'MUSIC_CONFIG_FILE':'/run/garyhub-music.env','COOKIE_DOMAIN':'.garyhub.uk'},'volumes':[{'type':'bind','source':'/etc/garyhub/music-r2.env','target':'/run/garyhub-music.env','read_only':True},{'type':'bind','source':'/existing/data','target':'/app/data'}]}},'networks':{'reading':{'external':True}}}
  with patch.object(adapter.d,'jr',return_value=config):_,out=adapter.d.compose_config(live,self.root)
  service=out['services']['calendar'];self.assertEqual(service['environment']['MUSIC_CONFIG_FILE'],'/run/garyhub-music.env');self.assertEqual(service['volumes'][0]['read_only'],True);self.assertEqual(service['volumes'][1]['source'],'/existing/data');self.assertEqual(out['networks'],{'reading':{'external':True}});self.assertEqual(adapter.d.HOOKS,{})
 def test_deployment_verifies_every_new_asset_and_private_study_gate(self):
  assets={a['route']:(ROOT/'lab-service/public'/a['route'].lstrip('/')).read_bytes() for a in adapter.CONFIG['asset_checksums']}
  with patch.object(adapter,'shared'),patch.object(adapter.d,'https',side_effect=lambda host,route:assets[route.split('?')[0]]),patch.object(adapter.d,'run',side_effect=self.checked_response):adapter.verify()
  with patch.object(adapter,'shared'),patch.object(adapter.d,'https',return_value=b'wrong'),self.assertRaisesRegex(RuntimeError,'asset mismatch'):adapter.verify()
 @staticmethod
 def checked_response(args,check=True):
  asset=adapter.CONFIG['protected_asset_checksums'][0]
  if args[0]=='docker':
   if args[:6]!=['docker','exec','garyhub-lab','node','-e',args[5]] or args[-1]!=asset['file']:raise AssertionError('Unexpected live-file command')
   return subprocess.CompletedProcess(args,0,asset['sha256'].encode())
  if '-D' in args:
   expected='https://tools.garyhub.uk/useful/markdown-viewer/?v=1.4.3.1'
   return subprocess.CompletedProcess(args,0,('HTTP/2 302\r\nLocation: https://calendar.garyhub.uk/login/?next='+quote(expected,safe='')+'\r\n\r\n').encode())
  return subprocess.CompletedProcess(args,0,b'401')
 def test_protected_file_hash_is_still_required(self):
  with patch.object(adapter.d,'run',return_value=subprocess.CompletedProcess([],0,b'incorrect')),self.assertRaisesRegex(RuntimeError,'asset mismatch in running container'):
   adapter.protected_asset(adapter.CONFIG['protected_asset_checksums'][0])
 def test_public_or_wrong_redirect_responses_are_rejected(self):
  asset=adapter.CONFIG['protected_asset_checksums'][0]
  for headers in [b'HTTP/2 200\r\n',b'HTTP/2 404\r\n',b'HTTP/2 302\r\nLocation: https://evil.invalid/login/\r\n',b'HTTP/2 302\r\nLocation: https://calendar.garyhub.uk/login/?next=https%3A%2F%2Fcalendar.garyhub.uk%2F\r\n']:
   with patch.object(adapter.d,'run',side_effect=[subprocess.CompletedProcess([],0,asset['sha256'].encode()),subprocess.CompletedProcess([],0,headers)]),self.assertRaisesRegex(RuntimeError,'login gate failed'):adapter.protected_asset(asset)
 def test_protected_file_digest_executes_real_node_and_never_follows_login(self):
  calls=[]
  def real_digest(args,check=True):
   calls.append(args)
   if args[0]=='docker':return subprocess.run([os.environ.get('GARYHUB_TEST_NODE','node'),'-e',args[5],str(ROOT/'lab-service/public/useful/markdown-viewer/index.html')],capture_output=True,check=True)
   return self.checked_response(args,check)
  with patch.object(adapter.d,'run',side_effect=real_digest):adapter.protected_asset(adapter.CONFIG['protected_asset_checksums'][0])
  self.assertNotIn('-L',calls[1]);self.assertNotIn('--location',calls[1]);self.assertIn('-D',calls[1])
 def test_health_checks_new_release_and_rollback_stops_on_later_deployment(self):
  with patch.object(adapter.d,'run',return_value=subprocess.CompletedProcess([],0)) as run:adapter.d.health('fixture',True)
  self.assertIn('1.4.3.1',run.call_args.args[0][-1])
  with patch.object(adapter.d,'image',return_value={'Image':'later'}),patch.object(adapter.d,'old_up') as up:
   with self.assertRaisesRegex(RuntimeError,'changed after this release'):adapter.d.restore({'services':{'calendar-app':{'name':'calendar-app','new_image_id':'candidate'}}},True)
   up.assert_not_called()
 def test_no_totp_overlays_change_only_the_health_release(self):
  for service,name in [('calendar-app','app.js'),('lab-service','server.cjs')]:
   prefix=ROOT/'scripts/releases';relative=Path('variant-overrides/1.3.4.1')/service/name
   before=(prefix/'v1.4.3.0'/relative).read_text();after=(prefix/'v1.4.3.1'/relative).read_text()
   self.assertEqual(after,before.replace('"1.4.3.0"','"1.4.3.1"'))
if __name__=='__main__':unittest.main()
