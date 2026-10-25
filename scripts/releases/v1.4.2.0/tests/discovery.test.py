"""Regression for the reported r2 service-name failure; credentials are synthetic."""
import importlib.util,json,subprocess,sys,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
HERE=Path(__file__).resolve().parents[1];sys.path.insert(0,str(HERE))
import service_discovery as sd
import integrations as host


def container(name,address,service=None,network='services',env=None):
 return {'Id':name+'-id','Name':'/'+name,'Image':name+'-image','State':{'Running':True},'Config':{'Env':[k+'='+v for k,v in(env or{}).items()],'Labels':{'com.docker.compose.service':service or name,'com.docker.compose.project.config_files':'/fixture/compose.yml'},'Entrypoint':None,'Cmd':[]},'NetworkSettings':{'Networks':{network:{'IPAddress':address,'Aliases':[name]}},'Ports':{}}}


class DiscoveryTests(unittest.TestCase):
 def test_uri_query_overrides_and_encoded_password(self):
  live=container('reader','172.18.0.2',env={'DATABASE_URL':'postgresql://wrong:first@old:5432/old?host=database&port=5544&user=reader&password=p%40ss%3Aword%3D1&dbname=reading'})
  self.assertEqual(sd.database_connection(live),{'host':'database','port':'5544','user':'reader','password':'p@ss:word=1','dbname':'reading','sslmode':'prefer'})
 def test_keyword_format_preserves_quoted_spaces_and_escapes(self):
  live=container('reader','172.18.0.2',env={'DATABASE_URL':"host = db user=reader dbname='reading space' password='a b\\'c\\\\d' sslmode=disable"})
  conn=sd.database_connection(live);self.assertEqual(conn['password'],"a b'c\\d");self.assertEqual(conn['dbname'],'reading space')
 def test_file_source_overrides_direct_value_and_is_read_privately(self):
  live=container('reader','172.18.0.2',env={'DATABASE_URL':'not selected','DATABASE_URL_FILE':'/run/secrets/database'})
  reader=lambda source,path:'postgres://reader:synthetic@db/reading'
  self.assertEqual(sd.database_connection(live,reader)['dbname'],'reading')
 def test_config_file_with_null_entrypoint(self):
  live=container('reader','172.18.0.2');live['Config']['Cmd']=['-config-file','/etc/miniflux.conf']
  self.assertEqual(sd.database_connection(live,lambda *args:'DATABASE_URL=host=db user=reader dbname=reading')['host'],'db')
 def test_invalid_secret_never_appears_in_error(self):
  for raw in ['postgres://reader:DO-NOT-PRINT@db:invalid/reading','host=db,other user=reader dbname=reading password=DO-NOT-PRINT','host=db user=reader dbname=reading password=DO-NOT-PRINT service=unreviewed']:
   with self.subTest(raw=raw):
    try:sd.database_connection(container('reader','172.18.0.2',env={'DATABASE_URL':raw}))
    except RuntimeError as error:self.assertNotIn('DO-NOT-PRINT',str(error))
    else:self.fail('unreviewed connection accepted')
 def test_actual_endpoint_selects_postgres_despite_different_compose_service(self):
  source=container('feeds','172.18.0.2','rss');pg=container('stack-postgres-1','172.18.0.3','postgres');other=container('unrelated-db','172.18.0.3','postgres',network='other')
  d=SimpleNamespace(run=lambda args,*a:subprocess.CompletedProcess(args,0,json.dumps(['172.18.0.3']).encode(),b''))
  self.assertIs(sd.endpoint_container(d,source,'database',[other,pg],'runner','Reading database'),pg)
 def test_ambiguous_or_external_database_stops(self):
  source=container('feeds','172.18.0.2');a=container('pg-a','172.18.0.3');b=container('pg-b','172.18.0.4')
  for addresses in [['172.18.0.3','172.18.0.4'],['203.0.113.4']]:
   d=SimpleNamespace(run=lambda args,*rest:subprocess.CompletedProcess(args,0,json.dumps(addresses).encode(),b''))
   with self.assertRaises(RuntimeError):sd.endpoint_container(d,source,'database',[a,b],'runner','Reading database')
 def test_static_ip_and_ipv6_are_canonicalised(self):
  source=container('feeds','fd00::2');pg=container('database','172.18.0.3');pg['NetworkSettings']['Networks']['services']['GlobalIPv6Address']='fd00:0:0:0:0:0:0:3'
  self.assertIs(sd.endpoint_container(None,source,'fd00::3',[pg],'runner','Reading database'),pg)
 def test_upstream_reading_token_is_preserved(self):
  for text,origin in [('reverse_proxy reader:8088\n','http://reader:8088'),('reverse_proxy http://feeds:8080 {\n header_up X-Test okay\n}\n','http://feeds:8080')]:self.assertEqual(sd.upstream(text)['origin'],origin)
  with self.assertRaises(RuntimeError):sd.upstream('reverse_proxy one:8080 two:8080')
 def test_private_pg_uses_stdin_and_actual_database_not_postgres_defaults(self):
  pg=container('postgres-service','172.18.0.3',env={'POSTGRES_USER':'different','POSTGRES_DB':'wrong_database'})
  conn={'host':'database','port':'5432','user':'reader','dbname':'actual_reading','password':'SYNTHETIC-DO-NOT-PRINT','sslmode':'disable'}
  with patch.object(sd.subprocess,'run',return_value=subprocess.CompletedProcess([],0,b'',b''))as run:
   sd.private_pg(pg,conn,['pg_dump','-Fc','-w'])
  args=run.call_args.args[0];wire=run.call_args.kwargs['input'].decode();self.assertNotIn(conn['password'],' '.join(args));self.assertNotIn(conn['dbname'],' '.join(args));self.assertIn(conn['password'],wire);self.assertIn(conn['dbname'],wire);self.assertNotIn('wrong_database',wire)
 def test_database_identity_must_match_before_backup(self):
  pg=container('database','172.18.0.3');conn={'user':'reader','dbname':'reading','port':'5432'}
  for response in [{'database':'reading','user':'reader','port':'5432','version_num':'150012'},{'database':'wrong','user':'reader','port':'5432','version_num':'150012'}]:
   with patch.object(sd,'private_pg',return_value=subprocess.CompletedProcess([],0,json.dumps(response).encode(),b'')):
    if response['database']=='reading':self.assertTrue(sd.verify_database(pg,conn)['database_identity_verified'])
    else:
     with self.assertRaises(RuntimeError):sd.verify_database(pg,conn)
 def test_backup_checks_return_code_and_restore_list(self):
  with tempfile.TemporaryDirectory()as temp:
   target=Path(temp)/'dump';pg=container('database','172.18.0.3')
   def dump(*args,**kwargs):kwargs['stdout'].write(b'PGDMP synthetic');return subprocess.CompletedProcess([],0)
   with patch.object(sd,'private_pg',side_effect=dump),patch.object(sd.subprocess,'run',return_value=subprocess.CompletedProcess([],0)):
    sd.backup_database(pg,{},target)
   self.assertTrue(target.read_bytes().startswith(b'PGDMP'))
   with patch.object(sd,'private_pg',return_value=subprocess.CompletedProcess([],1)):
    with self.assertRaises(RuntimeError):sd.backup_database(pg,{},Path(temp)/'failed')
 def test_stdin_shell_reader_preserves_literal_passwords_without_evaluation(self):
  with tempfile.TemporaryDirectory()as temp:
   marker=Path(temp)/'must-not-exist';password="literal ' $() $(touch "+str(marker)+") `echo x` \\ end"
   values=['database','127.0.0.1','5432','reader','actual_reading',password,'disable','8'];wire=('\n'.join(values)+'\n').encode()
   script=sd.PG_READER+'exec "$@"';code="import os,json;print(json.dumps({k:os.environ[k]for k in ['PGUSER','PGDATABASE','PGPASSWORD']}))"
   result=subprocess.run(['sh','-c',script,'test-reader',sys.executable,'-c',code],input=wire,capture_output=True,check=True);parsed=json.loads(result.stdout)
   self.assertEqual(parsed['PGPASSWORD'],password);self.assertEqual(parsed['PGDATABASE'],'actual_reading');self.assertFalse(marker.exists())
 def test_postgres_data_directory_is_from_the_current_image(self):
  pg=container('postgres18','172.18.0.3',env={'PGDATA':'/var/lib/postgresql/18/docker'});self.assertEqual(sd.postgres_data_path(pg),'/var/lib/postgresql/18/docker')
  pg['Config']['Env']=['PGDATA=/unexpected'];
  with self.assertRaises(RuntimeError):sd.postgres_data_path(pg)
 def test_caddy_replacement_accepts_verified_nondefault_reading_alias(self):
  text='files.garyhub.uk {\n reverse_proxy files:80\n}\nkuma.garyhub.uk {\n reverse_proxy status:3001\n}\nrss.garyhub.uk {\n reverse_proxy http://feeds:8088\n}\n'
  result=host.caddy_candidate(text,'http://feeds:8088');self.assertIn('reverse_proxy garyhub-lab:3000',result);self.assertNotIn('http://feeds:8088',result)


class PrepareRegression(unittest.TestCase):
 def test_r2_failure_layout_with_postgres_label_and_different_proxy_aliases(self):
  with tempfile.TemporaryDirectory()as temp:
   root=Path(temp);backup=root/'backup';backup.mkdir();caddy_file=root/'Caddyfile';caddy_file.write_text('files.garyhub.uk {\n reverse_proxy files:80\n}\nkuma.garyhub.uk {\n reverse_proxy status:3001\n}\nrss.garyhub.uk {\n reverse_proxy http://feeds:8088\n}\n')
   live_caddy=container('caddy','172.18.0.2');mf=container('rss-reader','172.18.0.3','reading',env={'DATABASE_URL':'postgres://reader:synthetic-password@database/actual_reading?sslmode=disable'})
   pg=container('my-services-postgres-1','172.18.0.4','postgres',env={'POSTGRES_USER':'different','POSTGRES_DB':'wrong_db','PGDATA':'/var/lib/postgresql/data'});files=container('files-app','172.18.0.5','files');status=container('status-app','172.18.0.6','kuma');cal=container('calendar-app','172.18.0.7');lab=container('garyhub-lab','172.18.0.8');inventory=[live_caddy,mf,pg,files,status,cal,lab]
   # Docker inspect IDs are hexadecimal; names and service labels intentionally differ from r2.
   for index,live in enumerate(inventory):live['Id']=str(index+1)*64
   records=[];addresses={'feeds':'172.18.0.3','database':'172.18.0.4','files':'172.18.0.5','status':'172.18.0.6'}
   def run(args,check=True):
    records.append(args)
    if args[:2]==['docker','ps']:out='\n'.join(live['Id']for live in inventory).encode();return subprocess.CompletedProcess(args,0,out,b'')
    if args[:2]==['docker','run']:return subprocess.CompletedProcess(args,0,json.dumps([addresses[args[-1]]]).encode(),b'')
    if args[:2]==['systemctl','is-enabled']:return subprocess.CompletedProcess(args,1,b'',b'')
    if args[:3]==['docker','exec','rss-reader']:return subprocess.CompletedProcess(args,0,b'Miniflux 2.2.0',b'')
    return subprocess.CompletedProcess(args,0,b'',b'')
   def jr(args):
    return inventory if args[:2]==['docker','inspect']else[{'IPAM':{'Config':[{'Subnet':'172.18.0.0/16'}]}}]
   def compose(live,unused):
    self.assertEqual(live['Name'],'/rss-reader');c={'service':'reading','new_config':str(root/'reading-compose.json'),'old_image_id':live['Image'],'name':'rss-reader'};return c,{'services':{'reading':{'environment':{}}}}
   d=SimpleNamespace(HOOKS={},ROOT=root,run=run,jr=jr,image=lambda name:live_caddy,say=lambda text:None,compose_config=compose,write=lambda p,v:Path(p).write_text(json.dumps(v)),sha=lambda p:__import__('hashlib').sha256(Path(p).read_bytes()).hexdigest())
   xray=root/'xray.json';original={'api':{'listen':'127.0.0.1:10085','services':['StatsService']}};xray.write_text(json.dumps(original));settings=root/'access.json';settings.write_text(json.dumps({'xray_config':str(xray),'xray_bin':'/fixture/xray','lock':str(root/'lock'),'entitlements':str(root/'entitlements')}))
   configs={key:{'services':{key:{'environment':{},'volumes':[]}}}for key in ['calendar-app','garyhub-lab']};state={'caddy_path':str(caddy_file),'services':{key:{'service':key}for key in configs}}
   def backup_db(live,connection,destination):self.assertEqual(live['Name'],'/my-services-postgres-1');self.assertEqual(connection['dbname'],'actual_reading');destination.write_bytes(b'PGDMP synthetic')
   with patch.object(host,'ACCESS_SETTINGS',settings),patch.object(host,'MONITOR',root/'monitor'),patch.object(host,'FILES',{}),patch.object(host,'verify_database',return_value={'database_identity_verified':True})as verify,patch.object(host,'backup_database',side_effect=backup_db):
    host.install(d);d.HOOKS['prepare'](state,configs,{'calendar-app':cal,'garyhub-lab':lab},backup)
   self.assertEqual(verify.call_args.args[1]['user'],'reader');self.assertEqual(state['integrations']['postgres_image'],pg['Image']);self.assertFalse(state['integrations']['applied']);self.assertEqual(json.loads(xray.read_text()),original)
   self.assertEqual(configs['calendar-app']['services']['calendar-app']['environment']['MINIFLUX_URL'],'http://feeds:8088');self.assertFalse(any('label=com.docker.compose.service=miniflux-db'in str(arg) for args in records for arg in args));self.assertNotIn('synthetic-password',json.dumps(records,default=str))


if __name__=='__main__':unittest.main()
