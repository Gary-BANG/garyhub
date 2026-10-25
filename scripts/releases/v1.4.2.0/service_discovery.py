"""Identify live services from their actual endpoints; never log database credentials."""
import ipaddress,json,re,subprocess
from urllib.parse import parse_qsl,unquote,urlsplit


def environment(live):
 return dict(value.split('=',1)for value in live.get('Config',{}).get('Env',[])if'='in value)


def running_containers(d):
 identifiers=d.run(['docker','ps','--no-trunc','--format','{{.ID}}']).stdout.decode().split()
 if not identifiers or len(identifiers)>128 or any(not re.fullmatch(r'[a-f0-9]{12,64}',value)for value in identifiers):raise RuntimeError('Running container inventory needs review')
 return d.jr(['docker','inspect',*identifiers])


def upstream(body):
 matches=re.findall(r'(?m)^\s*reverse_proxy\s+("[^"\r\n]+"|[^\s{}#]+)([^\r\n{]*)',body)
 if len(matches)!=1:raise RuntimeError('Expected one explicit reverse-proxy upstream for the selected service')
 token,tail=matches[0];token=token.strip('"')
 if tail.strip()and not tail.lstrip().startswith('#'):raise RuntimeError('Multiple or matched reverse-proxy upstreams need review')
 try:
  parsed=urlsplit(token if'://'in token else'http://'+token)
  if parsed.scheme not in ['http','https']or not parsed.hostname or parsed.username is not None or parsed.password is not None or parsed.path not in ['', '/']or parsed.query or parsed.fragment:raise ValueError()
  port=parsed.port or(443 if parsed.scheme=='https'else 80)
  if not 1<=port<=65535:raise ValueError()
  return {'token':token,'host':parsed.hostname,'port':port,'origin':parsed.scheme+'://'+parsed.netloc}
 except Exception:raise RuntimeError('Unsupported reverse-proxy upstream; no service was changed')from None


def namespace_addresses(d,anchor,host,runner_image):
 """Use the source container's actual Docker network namespace and DNS context."""
 try:return [str(ipaddress.ip_address(host))]
 except ValueError:pass
 if not isinstance(host,str)or len(host)>253 or not re.fullmatch(r'[A-Za-z0-9_.-]+',host):raise RuntimeError('Unsupported database or service hostname')
 source=anchor.get('Id')or anchor.get('Name','').lstrip('/')
 if not source:raise RuntimeError('Source container identity missing')
 code="const dns=require('node:dns').promises;setTimeout(()=>process.exit(2),6000).unref();dns.lookup(process.argv[1],{all:true}).then(v=>console.log(JSON.stringify(v.map(x=>x.address)))).catch(()=>process.exitCode=1)"
 result=d.run(['docker','run','--rm','--network','container:'+source,'--entrypoint','node',runner_image,'-e',code,'--',host],False)
 try:
  values=json.loads(result.stdout)
  if result.returncode or not isinstance(values,list)or not values or len(values)>32:raise ValueError()
  return list({str(ipaddress.ip_address(value))for value in values})
 except Exception:raise RuntimeError('Could not resolve the service in its current network namespace')from None


def endpoint_container(d,anchor,host,inventory,runner_image,label):
 addresses=set(namespace_addresses(d,anchor,host,runner_image));networks=set(anchor.get('NetworkSettings',{}).get('Networks',{}));matches=[]
 for live in inventory:
  if not live.get('State',{}).get('Running'):continue
  endpoints=live.get('NetworkSettings',{}).get('Networks',{})
  for network in networks&set(endpoints):
   endpoint=endpoints[network];ips={str(ipaddress.ip_address(value))for value in [endpoint.get('IPAddress'),endpoint.get('GlobalIPv6Address')]if value}
   if addresses&ips:matches.append(live);break
 if len(matches)!=1:raise RuntimeError(label+' endpoint matched '+str(len(matches))+' running containers on the actual shared networks; no service was changed')
 return matches[0]


def private_read(live,path):
 if not isinstance(path,str)or not path.startswith('/')or'\x00'in path:raise RuntimeError('Miniflux configuration file path needs review')
 result=subprocess.run(['docker','exec',live['Name'].lstrip('/'),'cat','--',path],capture_output=True,timeout=15)
 if result.returncode or len(result.stdout)>1024*1024:raise RuntimeError('Could not privately read the configured Miniflux database source')
 try:return result.stdout.decode('utf-8').strip()
 except UnicodeError:raise RuntimeError('Unsupported Miniflux configuration file encoding')from None


def keyword_connection(text):
 """libpq keyword format: single-quoted values and backslash escapes, no shell expansion."""
 values={};pos=0
 while pos<len(text):
  match=re.match(r'\s*([A-Za-z_][A-Za-z_0-9]*)\s*=\s*',text[pos:])
  if not match:
   if not text[pos:].strip():break
   raise ValueError()
  key=match[1];pos+=match.end();quote=pos<len(text)and text[pos]=="'";pos+=int(quote);parts=[];closed=not quote
  while pos<len(text):
   char=text[pos]
   if char=='\\':
    pos+=1
    if pos==len(text):raise ValueError()
    parts.append(text[pos]);pos+=1
   elif quote and char=="'":pos+=1;closed=True;break
   elif not quote and char.isspace():break
   else:parts.append(char);pos+=1
  if not closed or pos<len(text)and not text[pos].isspace():raise ValueError()
  values[key]=''.join(parts)
 return values


def database_connection(live,reader=private_read):
 env=environment(live);raw=env.get('DATABASE_URL')
 # *_FILE values override direct values in supported Miniflux configurations.
 if env.get('DATABASE_URL_FILE'):raw=reader(live,env['DATABASE_URL_FILE'])
 if not raw:
  args=[*(live.get('Config',{}).get('Entrypoint')or[]),*(live.get('Config',{}).get('Cmd')or[])]
  config_path=None
  for index,arg in enumerate(args):
   if arg.startswith(('-config-file=','--config-file=')):config_path=arg.split('=',1)[1]
   elif arg in ['-config-file','--config-file']and index+1<len(args):config_path=args[index+1]
  if config_path:
   config={}
   for line in reader(live,config_path).splitlines():
    if line.strip()and not line.lstrip().startswith('#')and'='in line:
     key,value=line.split('=',1);config[key.strip()]=value.strip()
   if config.get('DATABASE_URL_FILE'):raw=reader(live,config['DATABASE_URL_FILE'])
   else:raw=config.get('DATABASE_URL')
 if not raw:raise RuntimeError('Miniflux has no explicit readable database connection; identification stopped before changes')
 try:
  if raw.startswith(('postgres://','postgresql://')):
   parsed=urlsplit(raw)
   if parsed.fragment:raise ValueError()
   values={'host':parsed.hostname or'','port':str(parsed.port or 5432),'user':unquote(parsed.username or''),'password':unquote(parsed.password or''),'dbname':unquote(parsed.path.lstrip('/'))}
   for key,value in parse_qsl(parsed.query,keep_blank_values=True):values[key]=value
  else:values=keyword_connection(raw)
  for key,envkey in [('host','PGHOST'),('port','PGPORT'),('user','PGUSER'),('dbname','PGDATABASE'),('password','PGPASSWORD'),('sslmode','PGSSLMODE')]:
   if not values.get(key)and env.get(envkey):values[key]=env[envkey]
  if values.get('service')or values.get('hostaddr'):raise ValueError()
  values['dbname']=values.get('dbname')or values.get('user');values['port']=str(int(values.get('port')or'5432'));values['password']=values.get('password','');values['sslmode']=values.get('sslmode')or'prefer'
  if not values.get('host')or','in values['host']or not values.get('user')or not values.get('dbname')or not 1<=int(values['port'])<=65535:raise ValueError()
  if values['sslmode']not in ['disable','allow','prefer','require','verify-ca','verify-full']:raise ValueError()
  # The backup process uses stdin, never a connection URI or password in argv/logs.
  if any(any(char in values[key]for char in '\x00\r\n')for key in ['host','port','user','dbname','password','sslmode']):raise ValueError()
  if any(values.get(key)for key in ['sslrootcert','sslcert','sslkey','passfile','options']):raise ValueError()
  return {key:values[key]for key in ['host','port','user','dbname','password','sslmode']}
 except Exception:raise RuntimeError('Miniflux database connection format needs review; credentials were not printed')from None


PG_KEYS=['PGHOST','PGHOSTADDR','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT']
PG_READER='set -eu; '+''.join('IFS= read -r '+key+'; export '+key+'; 'for key in PG_KEYS)


def private_pg(live,connection,command,*,stdout=subprocess.PIPE,timeout=30):
 # Preserve the configured hostname for TLS checks while connecting inside the identified container.
 values=[connection['host'],'127.0.0.1',connection['port'],connection['user'],connection['dbname'],connection['password'],connection['sslmode'],'8']
 wire=('\n'.join(values)+'\n').encode()
 args=['docker','exec','-i',live['Name'].lstrip('/'),'sh','-c',PG_READER+'exec "$@"','garyhub-pg-check',*command]
 return subprocess.run(args,input=wire,stdout=stdout,stderr=subprocess.PIPE,timeout=timeout)


def verify_database(live,connection):
 query="SELECT json_build_object('database',current_database(),'user',current_user,'port',current_setting('port'),'version_num',current_setting('server_version_num'))"
 try:
  result=private_pg(live,connection,['psql','-X','-w','-At','-c',query]);info=json.loads(result.stdout)
  if result.returncode or info.get('database')!=connection['dbname']or info.get('user')!=connection['user']or str(info.get('port'))!=connection['port']or int(info.get('version_num',0))<140000:raise ValueError()
  return {'container':live['Name'].lstrip('/'),'database_identity_verified':True,'postgres_major':int(info['version_num'])//10000}
 except Exception:raise RuntimeError('The identified PostgreSQL database identity or authentication could not be verified; no service was changed')from None


def backup_database(live,connection,destination):
 try:
  with destination.open('xb')as output:result=private_pg(live,connection,['pg_dump','-Fc','-w'],stdout=output,timeout=90)
  if result.returncode or destination.stat().st_size<5:raise ValueError()
  with destination.open('rb')as source:
   result=subprocess.run(['docker','exec','-i',live['Name'].lstrip('/'),'pg_restore','--list'],stdin=source,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,timeout=30)
  if result.returncode:raise ValueError()
 except Exception:raise RuntimeError('The verified Miniflux database backup failed or could not be read; no service was changed')from None


def postgres_data_path(live):
 path=environment(live).get('PGDATA','/var/lib/postgresql/data')
 if not path.startswith('/var/lib/postgresql/')or'..'in path.split('/')or any(c in path for c in '\x00\r\n,:'):raise RuntimeError('PostgreSQL test data path needs review')
 return path
