#!/usr/bin/env python3
"""Reproducible source-only overlay for the two reviewed deployed v1.3.5.0 variants."""
from pathlib import Path
import argparse,hashlib,json,subprocess,tempfile,zipfile,shutil
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent
BASE='36784fdd1c74336cba57b9607177f8c9f20c4ad5';VERSION='1.3.5.1';BUILD='v1.3.5.1-r1'
def digest(data):return hashlib.sha256(data).hexdigest()
def norm(data):return digest(data.replace(b'\r\n',b'\n').rstrip(b'\n'))
def old(rel,variant):
 override='scripts/releases/v1.3.5.0/variant-overrides/'+variant+'/'+rel
 for path in ([override,rel]if variant=='1.3.4.1'else[rel]):
  p=subprocess.run(['git','show',BASE+':'+path],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
  if p.returncode==0:return p.stdout
 return None
def build(output):
 changed=[]
 for folder in ['calendar-app','lab-service']:
  for p in (ROOT/folder).rglob('*'):
   if not p.is_file()or'node_modules'in p.parts or'__pycache__'in p.parts or'.git'in p.parts:continue
   rel=p.relative_to(ROOT).as_posix()
   if '/data/'in rel or p.suffix in ['.sqlite','.db','.env','.pem','.key'] or p.name in ['homepage-protected.json','profile-private.json']:continue
   before=old(rel,'1.3.4.2')
   if before is None or norm(before)!=norm(p.read_bytes()):changed.append(rel)
 work=Path(tempfile.mkdtemp(prefix='garyhub-v1351-package-'));bundle=work/'payload';bundle.mkdir()
 def put(rel,data):
  p=bundle/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 manifest={'release':'v'+VERSION,'installer_build':BUILD,'base_commit':BASE,'requires_release':'1.3.5.0','variants':{},'files':{}}
 source_extra=['docs/GARYHUB_V1_3_5_1.md','docs/GARYHUB_V1_3_5_1_TESTS.md']
 tool_files=[p.relative_to(ROOT).as_posix()for p in HERE.rglob('*')if p.is_file()and'__pycache__'not in p.parts and p.suffix not in ['.zip','.png']]
 for variant in ['1.3.4.1','1.3.4.2']:
  baselines={'calendar-app':{},'garyhub-lab':{}};new_paths={k:[]for k in baselines};repo={}
  for rel in changed:
   service='calendar-app'if rel.startswith('calendar-app/')else'garyhub-lab';short=rel.split('/',1)[1]
   override=HERE/'variant-overrides'/variant/rel
   data=(override if override.is_file()else ROOT/rel).read_bytes();before=old(rel,variant)
   if before is None:new_paths[service].append(short)
   else:baselines[service][short]=[norm(before)]
   put('payload/'+variant+'/'+rel,data);put('source/'+variant+'/'+rel,data)
   repo[rel]=['MISSING'if before is None else norm(before),norm(data)]
  manifest['variants'][variant]={'baselines':baselines,'new_paths':new_paths}
  for rel in source_extra+tool_files:
   data=(ROOT/rel).read_bytes();put('source/'+variant+'/'+rel,data);repo[rel]=['MISSING',norm(data)]
  put('repo-baseline-'+variant+'.json',json.dumps(repo,indent=2).encode())
 for name in ['deploy.py','sync-source.ps1','README.md','TEST-RESULTS.md']:put(name,(HERE/name).read_bytes())
 for p in (HERE/'tests').rglob('*'):
  if p.is_file()and'__pycache__'not in p.parts:put('tests/'+p.relative_to(HERE/'tests').as_posix(),p.read_bytes())
 for p in sorted(bundle.rglob('*')):
  if p.is_file():manifest['files'][p.relative_to(bundle).as_posix()]=digest(p.read_bytes())
 put('manifest.json',json.dumps(manifest,indent=2).encode());payload=work/'payload.zip'
 with zipfile.ZipFile(payload,'w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for p in sorted(bundle.rglob('*')):
   if p.is_file():z.write(p,p.relative_to(bundle).as_posix())
 outer=work/('GaryHub-'+BUILD);outer.mkdir();shutil.copyfile(payload,outer/'payload.zip')
 template=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig').replace('PACKAGE_SHA256',digest(payload.read_bytes())).replace('INSTALLER_BUILD_ID',BUILD)
 (outer/'Install-GaryHub.ps1').write_text(template.replace('\r\n','\n'),encoding='utf-8-sig')
 for name in ['README.md','TEST-RESULTS.md','RUN-UPDATE.cmd','ROLLBACK.cmd','PUSH-TO-GITHUB.cmd','Push-GitHub.ps1']:
  data=(HERE/name).read_bytes()
  if name.endswith('.cmd'):data=data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')
  (outer/name).write_bytes(data)
 output=Path(output).resolve();output.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for p in sorted(outer.iterdir()):z.write(p,outer.name+'/'+p.name)
 report={'file':str(output),'size':output.stat().st_size,'sha256':digest(output.read_bytes()),'payload_files':len(manifest['files']),'runtime_paths':changed,'work':str(work)}
 print(json.dumps(report,indent=2));return report
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(parser.parse_args().output)
