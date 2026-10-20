#!/usr/bin/env python3
"""Reproducible source-only overlay for the two reviewed deployed v1.3.5.2 variants."""
from pathlib import Path
import argparse,hashlib,json,subprocess,tempfile,zipfile,shutil
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent
BASE='979b05f4083c2253b91cdb87fa496499ebde513d';VERSION='1.3.5.3';BUILD='v1.3.5.3-r1'
def digest(data):return hashlib.sha256(data).hexdigest()
def norm(data):return digest(data.replace(b'\r\n',b'\n').rstrip(b'\n'))
def old(rel,variant):
 override='scripts/releases/v1.3.5.2/variant-overrides/'+variant+'/'+rel
 for path in ([override,rel]if variant=='1.3.4.1'else[rel]):
  p=subprocess.run(['git','show',BASE+':'+path],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL)
  if p.returncode==0:return p.stdout
 return None
def excluded(path):
 p=Path(path);name=p.name.lower()
 if any(part.lower() in {'node_modules','__pycache__','.git','data','private-backup','private'} for part in p.parts):return True
 if any(part.lower().startswith('.env') and part.lower()!='.env.example' for part in p.parts):return True
 if name in {'homepage-protected.json','profile-private.json','deployment-state.json','garyhub-active-deployment.json'}:return True
 return p.suffix.lower() in {'.sqlite','.sqlite3','.db','.env','.pem','.key'} or name.endswith(('.sqlite-wal','.sqlite-shm','.db-wal','.db-shm'))
def source_bytes(rel):
 p=ROOT/rel
 if excluded(p) or p.is_symlink() or not p.resolve().is_relative_to(ROOT.resolve()):raise RuntimeError('Refusing a private or linked package input: '+rel)
 return p.read_bytes()
def build(output):
 changed=[]
 for folder in ['calendar-app','lab-service']:
  for p in (ROOT/folder).rglob('*'):
   if not p.is_file() or excluded(p):continue
   if p.is_symlink():raise RuntimeError('Linked runtime source requires review: '+str(p.relative_to(ROOT)))
   rel=p.relative_to(ROOT).as_posix()
   before=old(rel,'1.3.4.2')
   if before is None or norm(before)!=norm(source_bytes(rel)):changed.append(rel)
 work=Path(tempfile.mkdtemp(prefix='garyhub-v1353-package-'));bundle=work/'payload';bundle.mkdir()
 def put(rel,data):
  p=bundle/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 manifest={'release':'v'+VERSION,'installer_build':BUILD,'base_commit':BASE,'requires_release':'1.3.5.2','variants':{},'files':{}}
 source_extra=['README.md','docs/GARYHUB_V1_3_5_2.md','docs/GARYHUB_V1_3_5_2_TESTS.md','docs/GARYHUB_V1_3_5_3.md','docs/GARYHUB_V1_3_5_3_TESTS.md','scripts/releases/v1.3.5.2/Push-GitHub.ps1','scripts/releases/v1.3.5.2/sync-source.ps1','scripts/releases/v1.3.5.2/build-package.py']
 tool_files=[p.relative_to(ROOT).as_posix()for p in HERE.rglob('*')if p.is_file() and not excluded(p) and p.suffix not in ['.zip','.png']]
 for variant in ['1.3.4.1','1.3.4.2']:
  baselines={'calendar-app':{},'garyhub-lab':{}};new_paths={k:[]for k in baselines};repo={}
  for rel in changed:
   service='calendar-app'if rel.startswith('calendar-app/')else'garyhub-lab';short=rel.split('/',1)[1]
   override=HERE/'variant-overrides'/variant/rel
   data=source_bytes((override if override.is_file()else ROOT/rel).relative_to(ROOT).as_posix());before=old(rel,variant)
   if before is None:new_paths[service].append(short)
   else:baselines[service][short]=[norm(before)]
   put('payload/'+variant+'/'+rel,data);put('source/'+variant+'/'+rel,data)
   repo[rel]=['MISSING'if before is None else norm(before),norm(data)]
  manifest['variants'][variant]={'baselines':baselines,'new_paths':new_paths}
  for rel in source_extra+tool_files:
   data=source_bytes(rel);put('source/'+variant+'/'+rel,data);before=old(rel,variant);repo[rel]=['MISSING'if before is None else norm(before),norm(data)]
  put('repo-baseline-'+variant+'.json',json.dumps(repo,indent=2).encode())
 for name in ['deploy.py','sync-source.ps1','README.md','TEST-RESULTS.md']:put(name,source_bytes((HERE/name).relative_to(ROOT).as_posix()))
 for p in (HERE/'tests').rglob('*'):
  if p.is_file() and not excluded(p):put('tests/'+p.relative_to(HERE/'tests').as_posix(),source_bytes(p.relative_to(ROOT).as_posix()))
 for p in sorted(bundle.rglob('*')):
  if p.is_file():manifest['files'][p.relative_to(bundle).as_posix()]=digest(p.read_bytes())
 put('manifest.json',json.dumps(manifest,indent=2).encode());payload=work/'payload.zip'
 with zipfile.ZipFile(payload,'w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for p in sorted(bundle.rglob('*')):
   if p.is_file():z.write(p,p.relative_to(bundle).as_posix())
 outer=work/('GaryHub-'+BUILD);outer.mkdir();shutil.copyfile(payload,outer/'payload.zip')
 template=source_bytes((HERE/'Install-GaryHub.template.ps1').relative_to(ROOT).as_posix()).decode('utf-8-sig').replace('PACKAGE_SHA256',digest(payload.read_bytes())).replace('INSTALLER_BUILD_ID',BUILD)
 (outer/'Install-GaryHub.ps1').write_text(template.replace('\r\n','\n'),encoding='utf-8-sig')
 for name in ['README.md','TEST-RESULTS.md','RUN-UPDATE.cmd','ROLLBACK.cmd','PUSH-TO-GITHUB.cmd','Push-GitHub.ps1']:
  data=source_bytes((HERE/name).relative_to(ROOT).as_posix())
  if name.endswith('.cmd'):data=data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')
  (outer/name).write_bytes(data)
 output=Path(output).resolve();output.parent.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for p in sorted(outer.iterdir()):z.write(p,outer.name+'/'+p.name)
 report={'file':str(output),'size':output.stat().st_size,'sha256':digest(output.read_bytes()),'payload_files':len(manifest['files']),'runtime_paths':changed,'work':str(work)}
 print(json.dumps(report,indent=2));return report
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('output');build(parser.parse_args().output)
