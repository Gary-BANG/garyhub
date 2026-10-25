#!/usr/bin/env python3
"""Bounded, local host sampler. Public snapshots contain no configuration or credentials."""
import base64,fcntl,json,os,re,socket,ssl,subprocess,time
from datetime import datetime,timezone
from pathlib import Path

PRIVATE=Path('/var/lib/garyhub-monitor');PUBLIC=PRIVATE/'public';STATE=PRIVATE/'state.json'
def command(args,timeout=8):
 p=subprocess.run(args,capture_output=True,text=True,timeout=timeout)
 if p.returncode:raise RuntimeError('command unavailable')
 return p.stdout

def atomic(path,value,mode=0o600):
 path=Path(path);path.parent.mkdir(parents=True,exist_ok=True);tmp=path.with_suffix('.tmp')
 with tmp.open('w')as f:json.dump(value,f,ensure_ascii=False,separators=(',',':'));f.flush();os.fsync(f.fileno())
 os.chmod(tmp,mode);os.replace(tmp,path)

def meminfo(text):
 values={k:int(v)*1024 for k,v in re.findall(r'^(\w+):\s+(\d+) kB',text,re.M)}
 return {'total':values.get('MemTotal'),'available':values.get('MemAvailable'),'cached':values.get('Cached'),'swapTotal':values.get('SwapTotal'),'swapUsed':values.get('SwapTotal',0)-values.get('SwapFree',0)}

def cpu(text):
 fields=list(map(int,text.splitlines()[0].split()[1:9]));return {'total':sum(fields),'idle':fields[3]+fields[4]}

def traffic(raw):
 obj=json.loads(raw);out={}
 for item in obj.get('stat',[]):
  match=re.fullmatch(r'user>>>garyhub-managed-(\d+)>>>traffic>>>(uplink|downlink)',item.get('name',''))
  if match:
   uid=match[1];out.setdefault(uid,{'up':0,'down':0})['up'if match[2]=='uplink'else'down']=max(0,int(item.get('value',0)))
 return out

def accumulate(state,current,at,epoch):
 day=at[:10];month=at[:7];reset=state.get('epoch')not in [None,epoch]
 counter_reset=any(v<state.get('users',{}).get(uid,{}).get('last',{}).get(k,0)for uid,values in current.items()for k,v in values.items())
 if reset or counter_reset:state['counterGaps']=state.get('counterGaps',0)+1
 users=state.setdefault('users',{})
 for uid,value in current.items():
  u=users.setdefault(uid,{'total':{'up':0,'down':0},'days':{},'last':{}})
  delta={k:(v if reset or v<u['last'].get(k,0)else v-u['last'].get(k,0))for k,v in value.items()}
  if any(delta.values()):u['lastActive']=at
  bucket=u['days'].setdefault(day,{'up':0,'down':0})
  for k,v in delta.items():u['total'][k]+=v;bucket[k]+=v
  u['last']=value
 state['epoch']=epoch
 result=[]
 for uid,u in users.items():
  # Keep at most 400 date buckets. All-time totals remain independent.
  u['days']={d:v for d,v in u['days'].items()if d>=str(int(day[:4])-1)+day[4:]}
  result.append({'userId':int(uid),'lastActive':u.get('lastActive'),'total':u['total'],'today':u['days'].get(day,{'up':0,'down':0}),'month':{k:sum(v[k]for d,v in u['days'].items()if d.startswith(month))for k in ['up','down']}})
 return result

def probe(path):
 start=time.monotonic()
 try:
  with socket.create_connection(('127.0.0.1',443),timeout=5)as raw:
   with ssl.create_default_context().wrap_socket(raw,server_hostname='vpn.garyhub.uk')as conn:
    conn.settimeout(5);key=base64.b64encode(os.urandom(16)).decode()
    conn.sendall(f'GET {path} HTTP/1.1\r\nHost: vpn.garyhub.uk\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: {key}\r\n\r\n'.encode())
    response=conn.recv(1024).split(b'\r\n',1)[0]
    ok=b' 101 'in response
  return {'ok':ok,'ms':round((time.monotonic()-start)*1000,1)}
 except Exception:return {'ok':False,'ms':None}

def collect(config,state,now=None):
 now=now or datetime.now(timezone.utc);at=now.isoformat();warnings=[];memory=meminfo(Path('/proc/meminfo').read_text());ticks=cpu(Path('/proc/stat').read_text());previous=state.get('cpu',{});total=ticks['total']-previous.get('total',ticks['total']);idle=ticks['idle']-previous.get('idle',ticks['idle']);percent=100*(1-idle/total)if total>0 else None;state['cpu']=ticks
 processes=[]
 for p in Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   text=(p/'status').read_text();rss=re.search(r'^VmRSS:\s+(\d+)',text,re.M)
   if rss:processes.append({'pid':int(p.name),'name':re.search(r'^Name:\s+(.+)',text,re.M)[1][:60],'rss':int(rss[1])*1024})
  except (OSError,TypeError):pass
 disks=[]
 for mount in ['/', '/opt/my-services']:
  try:
   st=os.statvfs(mount);total_bytes=st.f_blocks*st.f_frsize;disks.append({'path':mount,'total':total_bytes,'used':(st.f_blocks-st.f_bfree)*st.f_frsize,'available':st.f_bavail*st.f_frsize})
  except OSError:pass
 def jsonlines(args):
  try:return [json.loads(line)for line in command(args,12).splitlines()if line.strip()]
  except Exception:warnings.append('Docker 统计暂不可用');return []
 containers=jsonlines(['docker','stats','--no-stream','--format','{{json .}}']);space=jsonlines(['docker','system','df','--format','{{json .}}'])
 dirs=state.get('directories',{'items':[]})
 if now.timestamp()-dirs.get('timestamp',0)>3600:
  try:
   text=command(['du','-x','-B1','--max-depth=1','/opt/my-services','/var/log','/var/lib/docker'],20)
   items=[]
   for line in text.splitlines():
    size,path=line.split('\t',1);items.append({'path':path,'bytes':int(size)})
   dirs={'at':at,'timestamp':now.timestamp(),'items':sorted(items,key=lambda x:x['bytes'],reverse=True)[:15]};state['directories']=dirs
  except Exception:warnings.append('目录统计超时或不可读；保留最近一次结果')
 vpn={'since':state.setdefault('since',at),'users':[],'trafficAvailable':False};epoch='unknown'
 try:
  show=dict(line.split('=',1)for line in command(['systemctl','show','xray','-p','ActiveState','-p','NRestarts','-p','MainPID','-p','ActiveEnterTimestampMonotonic']).splitlines()if'='in line)
  vpn.update(service=show.get('ActiveState','unknown'),restarts=int(show.get('NRestarts','0')));epoch=show.get('MainPID','')+':'+show.get('ActiveEnterTimestampMonotonic','')+':'+Path('/proc/sys/kernel/random/boot_id').read_text().strip()
 except Exception:warnings.append('Xray 状态暂不可用')
 try:
  xconfig=json.loads(Path(config['xray_config']).read_text());inbound=next(i for i in xconfig['inbounds']if i.get('tag')=='garyhub-access-wss');path=inbound['streamSettings']['wsSettings']['path'];latest=probe(path)
 except Exception:latest={'ok':None,'ms':None};warnings.append('VPN 握手探测未就绪')
 probes=state.setdefault('probes',[]);probes.append({'at':at,**latest});state['probes']=[p for p in probes if datetime.fromisoformat(p['at']).timestamp()>=now.timestamp()-86400][-2880:];vpn['probes']=state['probes']
 try:
  stats=traffic(command([config['xray_bin'],'api','statsquery','--server='+config['stats_address']],8));vpn['users']=accumulate(state,stats,at,epoch);vpn['trafficAvailable']=True
 except Exception:warnings.append('VPN 流量统计暂不可用');vpn['users']=accumulate(state,{},at,state.get('epoch'))
 try:
  ent=json.loads(Path(config['entitlements']).read_text());grants=ent.get('grants',{})
  by_id={str(u['userId']):u for u in vpn['users']}
  for uid,g in grants.items():
   if not uid.isdigit():continue
   active=not g.get('revoked')and(g.get('permanent')is True or datetime.fromisoformat(g['expiresAt'].replace('Z','+00:00'))>now)
   u=by_id.setdefault(uid,{'userId':int(uid),'lastActive':None,'total':None,'today':None,'month':None});u['authorized']=bool(active)
  vpn['users']=list(by_id.values())
 except Exception:warnings.append('VPN 授权列表暂不可用')
 vpn['counterGaps']=state.get('counterGaps',0)
 history=state.setdefault('history',[]);history.append({'at':at,'memoryPercent':100*(memory['total']-memory['available'])/memory['total']if memory['total']and memory['available']is not None else None,'cpuPercent':percent});state['history']=[p for p in history if datetime.fromisoformat(p['at']).timestamp()>=now.timestamp()-86400][-2880:]
 return {'schema':1,'generatedAt':at,'cpuPercent':percent,'memory':memory,'uptimeSeconds':float(Path('/proc/uptime').read_text().split()[0]),'disks':disks,'processes':sorted(processes,key=lambda x:x['rss'],reverse=True)[:10],'containers':[{k:c.get(k)for k in ['Name','CPUPerc','MemUsage','NetIO']}for c in containers],'dockerSpace':[{k:c.get(k)for k in ['Type','Size','Reclaimable']}for c in space],'directories':dirs,'vpn':vpn,'history':state['history'],'warnings':list(dict.fromkeys(warnings))}

def main():
 os.umask(0o077);PRIVATE.mkdir(mode=0o700,exist_ok=True);PUBLIC.mkdir(mode=0o755,exist_ok=True);os.chmod(PUBLIC,0o755)
 with (PRIVATE/'sampler.lock').open('a')as lock:
  fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
  config=json.loads(Path('/etc/garyhub-monitor.json').read_text());state=json.loads(STATE.read_text())if STATE.exists()else {}
  snapshot=collect(config,state);atomic(STATE,state);atomic(PUBLIC/'status.json',snapshot,0o644)
if __name__=='__main__':main()
