"""Build the self-contained Windows/SSH upgrade ZIP from this reviewed Git base."""
import hashlib,json,shutil,subprocess,sys,tempfile,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[3];HERE=Path(__file__).resolve().parent
BASE='3aec97c5a69fce9582e2c47647f5df16a64ced4e';VERSION='1.3.4.2';BUILD='v1.3.4.2-r2'
def git(*args):return subprocess.check_output(['git','-C',str(ROOT),*args])
def normalized(data):return hashlib.sha256(data.replace(b'\r\n',b'\n').rstrip(b'\n')).hexdigest()
def add_reviewed_runtime_baselines(baselines,here=HERE):
 config=json.loads((here/'reviewed-runtime-baselines.json').read_text())
 if config.get('schema')!=1 or config.get('required_base_release')!='v1.3.4.1':raise RuntimeError('Unexpected runtime baseline provenance')
 for variant in config['variants']:
  service,rel=variant['service'],variant['path'];fixture=here/variant['fixture']
  if service not in baselines or rel not in baselines[service] or not fixture.resolve().is_relative_to((here/'tests/fixtures').resolve()):raise RuntimeError('Runtime variant does not match an existing reviewed source')
  digest=normalized(fixture.read_bytes())
  if digest!=variant['normalized_sha256'] or hashlib.sha256(fixture.read_bytes()).hexdigest()!=variant['prior_release_raw_sha256']:raise RuntimeError('Reviewed runtime fixture checksum mismatch')
  # Keep repository synchronization on its Git base; inherited image variants apply only to runtime checks.
  baselines[service][rel]=list(dict.fromkeys([*baselines[service][rel],digest]))
def main():
 output=Path(sys.argv[1]).resolve();output.mkdir(parents=True,exist_ok=True)
 changed=set(git('diff','--name-only',BASE).decode().splitlines())|set(git('ls-files','--others','--exclude-standard').decode().splitlines())
 changed={p for p in changed if (ROOT/p).is_file()}
 if any(p.endswith(('.sqlite','.env','.pem','.key')) or 'private-backup/' in p for p in changed):raise RuntimeError('Unexpected private artifact in source changes')
 work=Path(tempfile.mkdtemp(prefix='garyhub-package-'));outer=work/('GaryHub-'+BUILD);inner=work/'inner';outer.mkdir();inner.mkdir()
 for p in ['deploy.py','sync-source.ps1','reviewed-runtime-baselines.json']:
  shutil.copy2(HERE/p,inner/p)
 shutil.copytree(HERE/'tests',inner/'tests',ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
 for filename in ['README.md','TEST-RESULTS.md']:
  source=ROOT/'docs'/('GARYHUB_V1_3_4_2.md' if filename=='README.md' else 'GARYHUB_V1_3_4_2_TESTS.md')
  shutil.copy2(source,inner/filename);shutil.copy2(source,outer/filename)
 baselines={'calendar-app':{},'garyhub-lab':{}};new_paths={'calendar-app':[],'garyhub-lab':[]};repo_baseline={}
 for rel in sorted(changed):
  target=inner/'source'/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/rel,target)
  exists=subprocess.run(['git','-C',str(ROOT),'cat-file','-e',BASE+':'+rel],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
  if exists:repo_baseline[rel]=[normalized(git('show',BASE+':'+rel))]
  folder=rel.split('/',1)[0];relative=rel.split('/',1)[1] if '/'in rel else ''
  runtime=(folder=='calendar-app' and relative.endswith(('.js','.json'))) or (folder=='lab-service' and (relative.startswith('public/') or '/'not in relative and relative.endswith('.cjs')))
  if not runtime:continue
  target=inner/'payload'/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(ROOT/rel,target)
  name='calendar-app' if folder=='calendar-app' else 'garyhub-lab'
  if exists:baselines[name][relative]=repo_baseline[rel]
  else:new_paths[name].append(relative)
 for rel in ['calendar-app/db.js','calendar-app/package.json','calendar-app/auth-utils.js','calendar-app/session-store.js','lab-service/access-store.cjs','lab-service/access-connection.cjs','lab-service/user-cleanup.cjs']:
  folder,relative=rel.split('/',1);name='calendar-app'if folder=='calendar-app'else'garyhub-lab';baselines[name][relative]=[normalized(git('show',BASE+':'+rel))];repo_baseline.setdefault(rel,baselines[name][relative])
 add_reviewed_runtime_baselines(baselines)
 (inner/'repo-baseline.json').write_text(json.dumps(repo_baseline,indent=2))
 files={p.relative_to(inner).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()for p in inner.rglob('*')if p.is_file()}
 (inner/'manifest.json').write_text(json.dumps({'release':'v'+VERSION,'installer_build':BUILD,'base_commit':BASE,'files':files,'baselines':baselines,'new_paths':new_paths},indent=2))
 with zipfile.ZipFile(outer/'payload.zip','w',zipfile.ZIP_DEFLATED)as z:
  for p in sorted(inner.rglob('*')):
   if p.is_file():z.write(p,p.relative_to(inner))
 digest=hashlib.sha256((outer/'payload.zip').read_bytes()).hexdigest()
 template=(HERE/'Install-GaryHub.template.ps1').read_text(encoding='utf-8-sig').replace('PACKAGE_SHA256',digest).replace('INSTALLER_BUILD_ID',BUILD)
 (outer/'Install-GaryHub.ps1').write_text(template.replace('\r\n','\n'),encoding='utf-8-sig',newline='\r\n')
 for file in ['Push-GitHub.ps1','RUN-UPDATE.cmd','ROLLBACK.cmd','PUSH-TO-GITHUB.cmd']:shutil.copy2(HERE/file,outer/file)
 archive=output/('GaryHub_v'+VERSION+'_Update.zip')
 with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED)as z:
  for p in sorted(outer.rglob('*')):
   if p.is_file():z.write(p,p.relative_to(work))
 print(json.dumps({'file':str(archive),'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'source_files':len(changed),'payload_files':len(files),'work':str(work)},indent=2))
if __name__=='__main__':main()
