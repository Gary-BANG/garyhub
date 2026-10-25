import copy,hashlib,importlib.util,json,os,subprocess,tempfile,unittest
from types import SimpleNamespace
from unittest.mock import patch
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
def load(name,path):
 spec=importlib.util.spec_from_file_location(name,path);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);return module
x=load('integration142',ROOT/'scripts/releases/v1.4.2.0/integrations.py');c=load('collector142',ROOT/'server-monitor/collect.py')
class HostTests(unittest.TestCase):
 def test_statistics_do_not_modify_transport_or_clients(self):
  original={'inbounds':[{'tag':'garyhub-access-wss','settings':{'clients':[{'id':'synthetic-private'}]}}],'policy':{'levels':{'0':{'handshake':4}},'system':{'statsInboundUplink':False}}};new=x.xray_candidate(original)
  self.assertEqual(new['inbounds'],original['inbounds']);self.assertEqual(new['api']['listen'],'127.0.0.1:10085');self.assertEqual(new['api']['services'],['StatsService']);self.assertEqual(original['policy']['system']['statsInboundUplink'],False)
  current=copy.deepcopy(new);current['inbounds'][0]['settings']['clients'].append({'id':'later-user'});current['policy']['levels']['0']['handshake']=8
  restored=x.restore_xray(current,original,new);self.assertEqual(len(restored['inbounds'][0]['settings']['clients']),2);self.assertEqual(restored['policy']['levels']['0']['handshake'],8);self.assertNotIn('api',restored);self.assertEqual(restored['policy']['system']['statsInboundUplink'],False)
  current['api']['listen']='0.0.0.0:10085'
  with self.assertRaises(RuntimeError):x.restore_xray(current,original,new)
 def test_unknown_api_stops(self):
  with self.assertRaises(RuntimeError):x.xray_candidate({'api':{'listen':'0.0.0.0:10085','services':['HandlerService']}})
 def test_caddy_gates_preserve_other_sites_and_existing_protection(self):
  original='garyhub.uk {\n respond "home"\n}\nfiles.garyhub.uk {\n basic_auth {\n  alice synthetic\n }\n reverse_proxy filebrowser:80\n}\nkuma.garyhub.uk {\n reverse_proxy uptime-kuma:3001\n}\nrss.garyhub.uk {\n encode gzip\n reverse_proxy miniflux:8080\n}\n'
  new=x.caddy_candidate(original);self.assertIn('garyhub.uk {\n respond "home"',new);self.assertIn('basic_auth',new);self.assertEqual(new.count('forward_auth calendar-app:3000'),2);self.assertIn('reverse_proxy garyhub-lab:3000',new)
  with self.assertRaises(RuntimeError):x.caddy_candidate(new)
 def test_traffic_counters_roll_over_days_and_restarts_without_negative_values(self):
  raw={'stat':[{'name':'user>>>garyhub-managed-2>>>traffic>>>uplink','value':100},{'name':'user>>>legacy-private>>>traffic>>>downlink','value':999}]};self.assertEqual(c.traffic(json.dumps(raw)),{'2':{'up':100,'down':0}})
  state={};c.accumulate(state,{'2':{'up':100,'down':200}},'2026-10-25T00:00:00+00:00','a');rows=c.accumulate(state,{'2':{'up':150,'down':250}},'2026-10-26T00:00:00+00:00','a');self.assertEqual(rows[0]['today'],{'up':50,'down':50});self.assertEqual(rows[0]['month'],{'up':150,'down':250});rows=c.accumulate(state,{'2':{'up':10,'down':20}},'2026-10-26T00:01:00+00:00','b');self.assertEqual(rows[0]['total'],{'up':160,'down':270});self.assertEqual(state['counterGaps'],1)
 def test_memory_uses_available_not_merely_free(self):
  m=c.meminfo('MemTotal: 1000 kB\nMemAvailable: 600 kB\nMemFree: 100 kB\nSwapTotal: 200 kB\nSwapFree: 180 kB\n');self.assertEqual(m['available'],600*1024);self.assertEqual(m['swapUsed'],20*1024)

 def rollback_fixture(self,root):
  backup=root/'backup';backup.mkdir();xf=root/'xray.json';old={'inbounds':[{'settings':{'clients':[{'id':'original-user'}]}}]};installed=x.xray_candidate(old);current=copy.deepcopy(installed);current['inbounds'][0]['settings']['clients'].append({'id':'later-user'});xf.write_text(json.dumps(current));oldfile=backup/'xray-old';oldfile.write_text(json.dumps(old));staged=backup/'xray-new';staged.write_text(json.dumps(installed));caddy=root/'Caddyfile';caddy.write_text('new access gates');(backup/'Caddyfile').write_text('prior routes');config=root/'monitor.json';config.write_text('installed');lock=root/'access.lock';lock.touch();data=root/'current-reading-records';data.write_text('latest records')
  sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest();calls=[]
  d=SimpleNamespace(HOOKS={},STATE=root/'state',ROOT=root,sha=sha,run=lambda args,*a:calls.append(args),image=lambda name:{'Image':'same','Config':{'Labels':{'com.docker.compose.project.config_files':'new-compose'}}},set_caddy=lambda p,text:Path(p).write_text(text),old_up=lambda spec:calls.append(['old_up']),write=lambda p,v:Path(p).write_text(json.dumps(v)))
  x.install(d);s={'backup':str(backup),'caddy_path':str(caddy),'managed_caddy_sha':sha(caddy),'integrations':{'applied':True,'xray_path':str(xf),'xray_staged':str(staged),'access_lock':str(lock),'miniflux':{'name':'miniflux','old_image_id':'same','new_image_id':'same','new_config':'new-compose'},'files':{str(xf):{'existed':True,'backup':str(oldfile),'new_sha':sha(staged)},str(config):{'existed':False,'new_sha':sha(config)}}}}
  return d,s,calls,data,config,xf
 def test_host_rollback_preserves_current_reading_records_and_new_vpn_clients(self):
  with tempfile.TemporaryDirectory()as temp:
   d,s,calls,data,config,xf=self.rollback_fixture(Path(temp));d.HOOKS['rollback'](s,True);self.assertEqual(data.read_text(),'latest records');self.assertFalse(config.exists());current=json.loads(xf.read_text());self.assertNotIn('api',current);self.assertEqual(len(current['inbounds'][0]['settings']['clients']),2);self.assertFalse(s['integrations']['applied']);self.assertIn(['old_up'],calls)
 def test_later_host_config_blocks_rollback_before_any_side_effect(self):
  with tempfile.TemporaryDirectory()as temp:
   d,s,calls,data,config,xf=self.rollback_fixture(Path(temp));config.write_text('changed later')
   with self.assertRaisesRegex(RuntimeError,'changed'):d.HOOKS['rollback'](s,True)
   self.assertEqual(calls,[]);self.assertEqual(data.read_text(),'latest records')
 def test_statistics_change_blocks_rollback_before_caddy_or_service_changes(self):
  with tempfile.TemporaryDirectory()as temp:
   d,s,calls,data,config,xf=self.rollback_fixture(Path(temp));current=json.loads(xf.read_text());current['api']['listen']='127.0.0.1:10086';xf.write_text(json.dumps(current))
   with self.assertRaisesRegex(RuntimeError,'statistics configuration changed'):d.HOOKS['rollback'](s,True)
   self.assertEqual(calls,[]);self.assertEqual(Path(s['caddy_path']).read_text(),'new access gates')
 def test_later_caddy_change_stops_without_overwriting_routes(self):
  with tempfile.TemporaryDirectory()as temp:
   d,s,calls,data,config,xf=self.rollback_fixture(Path(temp));Path(s['caddy_path']).write_text('a newer route')
   with self.assertRaisesRegex(RuntimeError,'Caddy changed'):d.HOOKS['rollback'](s,True)
   self.assertEqual(calls,[]);self.assertEqual(Path(s['caddy_path']).read_text(),'a newer route')
 def test_single_counter_reset_does_not_double_count_other_users(self):
  state={};c.accumulate(state,{'2':{'up':100,'down':100},'3':{'up':100,'down':100}},'2026-10-25T00:00:00+00:00','same')
  rows=c.accumulate(state,{'2':{'up':10,'down':10},'3':{'up':150,'down':150}},'2026-10-25T00:01:00+00:00','same');by_id={u['userId']:u for u in rows};self.assertEqual(by_id[2]['total']['up'],110);self.assertEqual(by_id[3]['total']['up'],150)

if __name__=='__main__':unittest.main()
