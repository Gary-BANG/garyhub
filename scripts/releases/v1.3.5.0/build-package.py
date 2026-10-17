#!/usr/bin/env python3
"""Build the reviewed two-baseline GaryHub update without production data."""
from pathlib import Path
import argparse,hashlib,json,tempfile,zipfile,shutil
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent
VERSION='1.3.5.0';BUILD='v1.3.5.0-r1'
def digest(data):return hashlib.sha256(data).hexdigest()
def norm(data):return digest(data.replace(b'\r\n',b'\n').rstrip(b'\n'))
def main():
 parser=argparse.ArgumentParser();parser.add_argument('output');args=parser.parse_args();out=Path(args.output).resolve();out.parent.mkdir(parents=True,exist_ok=True)
 review=json.loads((HERE/'reviewed-baselines.json').read_text());work=Path(tempfile.mkdtemp(prefix='garyhub-package-'));bundle=work/'payload';bundle.mkdir()
 def content(version,rel):
  override=HERE/'variant-overrides'/version/rel
  data=(override if override.is_file()else ROOT/rel).read_bytes()
  expected=review['final_hashes'][version].get(rel)
  if expected and digest(data)!=expected:raise RuntimeError('Reviewed source changed: '+version+'/'+rel)
  return data
 def put(rel,data):
  p=bundle/rel;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
 def tool_files():return [p for p in HERE.rglob('*')if p.is_file()and'__pycache__'not in p.parts]
 manifest={'release':'v'+VERSION,'installer_build':BUILD,'base_commit':'3aec97c5a69fce9582e2c47647f5df16a64ced4e','variants':{},'files':{}}
 for version in ['1.3.4.1','1.3.4.2']:
  baselines={'calendar-app':{},'garyhub-lab':{}};new_paths={'calendar-app':[],'garyhub-lab':[]}
  for rel in review['runtime_paths'][version]:
   service='calendar-app'if rel.startswith('calendar-app/')else'garyhub-lab';short=rel.split('/',1)[1];put('payload/'+version+'/'+rel,content(version,rel));old=review['baselines'][version].get(rel)
   if old:baselines[service][short]=[old['normalized']]
   else:new_paths[service].append(short)
  for key in ['calendar-app','garyhub-lab']:
   for short,allowed in review.get('runtime_aliases',{}).get(version,{}).get(key,{}).items():
    if short in baselines[key]:baselines[key][short]=list(dict.fromkeys(baselines[key][short]+allowed))
  manifest['variants'][version]={'baselines':baselines,'new_paths':new_paths}
  repo_baseline={}
  for rel in review['source_paths'][version]:
   data=content(version,rel);put('source/'+version+'/'+rel,data);allowed=[]
   choices=['1.3.4.1','1.3.4.2']if version=='1.3.4.2'else['1.3.4.1']
   for b in choices:
    entry=review['baselines'][b].get(rel);allowed.append(entry['normalized']if entry else'MISSING')
   allowed.append(norm(data));repo_baseline[rel]=list(dict.fromkeys(allowed))
  # The release tools are shared source and have no production credentials.
  for p in tool_files():
   rel=p.relative_to(ROOT).as_posix();data=p.read_bytes();put('source/'+version+'/'+rel,data);repo_baseline[rel]=['MISSING',norm(data)]
  put('repo-baseline-'+version+'.json',json.dumps(repo_baseline,indent=2).encode())
 for name in ['deploy.py','sync-source.ps1','README.md','TEST-RESULTS.md']:put(name,(HERE/name).read_bytes())
 for p in (HERE/'tests').rglob('*'):
  if p.is_file()and'__pycache__'not in p.parts:put('tests/'+p.relative_to(HERE/'tests').as_posix(),p.read_bytes())
 for p in bundle.rglob('*'):
  if p.is_file():manifest['files'][p.relative_to(bundle).as_posix()]=digest(p.read_bytes())
 put('manifest.json',json.dumps(manifest,indent=2).encode())
 payload=work/'payload.zip'
 with zipfile.ZipFile(payload,'w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for p in sorted(bundle.rglob('*')):
   if p.is_file():z.write(p,p.relative_to(bundle).as_posix())
 expected=digest(payload.read_bytes());outer=work/('GaryHub-'+BUILD);outer.mkdir();shutil.copyfile(payload,outer/'payload.zip')
 template=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig').replace('PACKAGE_SHA256',expected).replace('INSTALLER_BUILD_ID',BUILD)
 (outer/'Install-GaryHub.ps1').write_text(template.replace('\r\n','\n'),encoding='utf-8-sig')
 for name in ['README.md','TEST-RESULTS.md','RUN-UPDATE.cmd','ROLLBACK.cmd','PUSH-TO-GITHUB.cmd','Push-GitHub.ps1']:
  data=(HERE/name).read_bytes()
  if name.endswith('.cmd'):data=data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')
  (outer/name).write_bytes(data)
 with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for p in sorted(outer.iterdir()):z.write(p,outer.name+'/'+p.name)
 print(json.dumps({'file':str(out),'size':out.stat().st_size,'sha256':digest(out.read_bytes()),'payload_files':len(manifest['files']),'runtime_files':{v:len(review['runtime_paths'][v])for v in review['runtime_paths']}},indent=2))
if __name__=='__main__':main()
