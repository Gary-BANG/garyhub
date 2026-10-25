#!/usr/bin/env python3
"""Exercise genuine Caddy forwarding and Xray VLESS/WS traffic on loopback only."""
import http.server,importlib.util,json,os,socket,subprocess,tempfile,threading,time,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
def module(name,path):
 spec=importlib.util.spec_from_file_location(name,path);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
x=module('integration_native',ROOT/'scripts/releases/v1.4.2.0/integrations.py');c=module('collector_native',ROOT/'server-monitor/collect.py')
def port():
 with socket.socket()as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  if self.path.startswith('/api/hub/tool-auth/'):
   ok=self.headers.get('Cookie')=='synthetic-admin=1';self.send_response(200 if ok else 403);self.end_headers();self.wfile.write(b'auth')
  else:self.send_response(200);self.end_headers();self.wfile.write(b'synthetic-private-data'+b'x'*10000)
 def log_message(self,*args):pass

def main():
 with tempfile.TemporaryDirectory(prefix='garyhub142-native-')as temp:
  work=Path(temp);processes=[];logs=[];backend=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=backend.serve_forever,daemon=True);thread.start();bp=backend.server_port
  def launch(args):
   log=(work/('log'+str(len(logs)))).open('w+');logs.append(log);p=subprocess.Popen(args,stdout=log,stderr=log);processes.append(p);return p
  def wait_socket(p,number):
   for _ in range(50):
    if p.poll()is not None:raise RuntimeError('Native process exited')
    try:
     with socket.create_connection(('127.0.0.1',number),timeout=.2):return
    except OSError:time.sleep(.1)
   raise RuntimeError('Native listener timed out')
  try:
   cp=port();text='garyhub.uk {\n respond "home"\n}\nfiles.garyhub.uk {\n reverse_proxy filebrowser:80\n}\nkuma.garyhub.uk {\n reverse_proxy uptime-kuma:3001\n}\nrss.garyhub.uk {\n reverse_proxy miniflux:8080\n}\n'
   candidate=x.caddy_candidate(text)
   for name in ['files.garyhub.uk','kuma.garyhub.uk','rss.garyhub.uk','garyhub.uk']:candidate=__import__('re').sub(r'(?m)^'+__import__('re').escape(name)+r' \{','http://'+name+':'+str(cp)+' {',candidate)
   for upstream in ['calendar-app:3000','filebrowser:80','uptime-kuma:3001','garyhub-lab:3000']:candidate=candidate.replace(upstream,'127.0.0.1:'+str(bp))
   candidate='{\n admin off\n auto_https off\n persist_config off\n}\n'+candidate;cfg=work/'Caddyfile';cfg.write_text(candidate);caddy=os.environ['GARYHUB_CADDY']
   subprocess.run([caddy,'validate','--config',str(cfg),'--adapter','caddyfile'],check=True,stdout=subprocess.PIPE,stderr=None);p=launch([caddy,'run','--config',str(cfg),'--adapter','caddyfile']);wait_socket(p,cp)
   for host in ['files.garyhub.uk','kuma.garyhub.uk']:
    for cookie,status in [('',403),('synthetic-admin=1',200)]:
     request=urllib.request.Request(f'http://127.0.0.1:{cp}/private/deep-link',headers={'Host':host,'Cookie':cookie})
     try:
      with urllib.request.urlopen(request)as response:self_status=response.status;body=response.read()
     except urllib.error.HTTPError as error:self_status=error.code;body=error.read()
     assert self_status==status,(host,self_status,status)
     if status==403:assert b'synthetic-private-data'not in body
   print('NATIVE CADDY PASS: actual 2.10.2 parser and reverse-proxy gate reject unauthorised deep links before backend content.',flush=True)
   xray=os.environ['GARYHUB_XRAY'];sp,ap,socks=port(),port(),port();uid='11111111-1111-4111-8111-111111111111';server=x.xray_candidate({'log':{'loglevel':'warning'},'inbounds':[{'tag':'garyhub-access-wss','listen':'127.0.0.1','port':sp,'protocol':'vless','settings':{'clients':[{'id':uid,'email':'garyhub-managed-2'}],'decryption':'none'},'streamSettings':{'network':'ws','wsSettings':{'path':'/synthetic'}}}],'outbounds':[{'protocol':'freedom'}]});server['api']['listen']='127.0.0.1:'+str(ap)
   sf=work/'server.json';sf.write_text(json.dumps(server));subprocess.run([xray,'run','-test','-config='+str(sf)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);p=launch([xray,'run','-config='+str(sf)]);wait_socket(p,ap)
   client={'log':{'loglevel':'warning'},'inbounds':[{'listen':'127.0.0.1','port':socks,'protocol':'socks','settings':{'auth':'noauth'}}],'outbounds':[{'protocol':'vless','settings':{'vnext':[{'address':'127.0.0.1','port':sp,'users':[{'id':uid,'encryption':'none'}]}]},'streamSettings':{'network':'ws','wsSettings':{'path':'/synthetic'}}}]};cf=work/'client.json';cf.write_text(json.dumps(client));p=launch([xray,'run','-config='+str(cf)]);wait_socket(p,socks)
   with socket.create_connection(('127.0.0.1',socks),timeout=5)as sock:
    sock.sendall(b'\x05\x01\x00');assert sock.recv(2)==b'\x05\x00';sock.sendall(b'\x05\x01\x00\x01'+socket.inet_aton('127.0.0.1')+bp.to_bytes(2,'big'));reply=sock.recv(10);assert reply[:2]==b'\x05\x00';sock.sendall(b'GET / HTTP/1.1\r\nHost: loopback\r\nConnection: close\r\n\r\n');body=b''
    while True:
     block=sock.recv(16384)
     if not block:break
     body+=block
    assert b'synthetic-private-data'in body
   time.sleep(.2);raw=subprocess.check_output([xray,'api','statsquery','--server=127.0.0.1:'+str(ap)],text=True);values=c.traffic(raw);assert values['2']['up']>0 and values['2']['down']>=10000,values
   print('NATIVE XRAY PASS: actual 26.2.6 config, VLESS/WebSocket transport, SOCKS client, user upload/download counters and collector parser.',flush=True)
  except Exception:
   for log in logs:log.flush();log.seek(0);print(log.read()[-2500:])
   raise
  finally:
   for p in reversed(processes):
    p.terminate()
    try:p.wait(timeout=3)
    except subprocess.TimeoutExpired:p.kill();p.wait()
   for log in logs:log.close()
   backend.shutdown();backend.server_close()
if __name__=='__main__':main()
