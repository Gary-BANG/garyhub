"""Reconcile only the recorded v1.4.3.1-r1 rollback path mismatch.

No containers, Compose files or user data are changed. The original index and
both fully resolved configurations must prove that this is the known rollback.
"""
import copy,json,re
from pathlib import Path

NAMES={'calendar-app','garyhub-lab'}
def regular(path,base=None):
 if not isinstance(path,(str,Path)):raise RuntimeError('Rollback recovery stopped: invalid evidence file path')
 path=Path(path)
 if not path.is_absolute() or not path.is_file() or any(p.is_symlink() for p in [path,*path.parents]):raise RuntimeError('Rollback recovery requires regular, unlinked evidence files: '+str(path))
 if base is not None and not path.is_relative_to(base):raise RuntimeError('Rollback recovery evidence escaped its recorded directory')
 return path

def reconcile(d,lives,spec):
 root=Path(spec['root']);state_file=regular(root/'deployment-state.json',root)
 manifest=regular(root/'manifest.json',root)
 if d.sha(manifest)!=spec['manifest_sha256']:raise RuntimeError('Rollback recovery stopped: unrecognized r1 package')
 state=json.loads(state_file.read_text())
 if state.get('status')!='rolled-back' or state.get('release')!='v1.4.3.1' or state.get('version')!='1.4.3.1' or state.get('requires_release')!='1.4.3.0' or not state.get('old_active_exists') or set(state.get('services',{}))!=NAMES or set(lives)!=NAMES:raise RuntimeError('Rollback recovery stopped: r1 state does not describe the completed known rollback')
 backup=Path(state.get('backup',''))
 if backup.parent!=root/'private-backup' or not re.fullmatch(r'\d{8}T\d{6}Z',backup.name):raise RuntimeError('Rollback recovery stopped: backup location differs')
 prior_file=regular(backup/'active.json',backup);active_file=regular(d.ACTIVE)
 original_sha=d.sha(active_file)
 if d.sha(prior_file)!=original_sha:raise RuntimeError('Rollback recovery stopped: active index changed after r1')
 original=json.loads(prior_file.read_text());updated=copy.deepcopy(original)
 file_hashes={state_file:d.sha(state_file),manifest:d.sha(manifest),prior_file:d.sha(prior_file)}
 caddy=regular(state.get('caddy_path',''));caddy_backup=regular(backup/'Caddyfile',backup)
 if d.sha(caddy)!=d.sha(caddy_backup):raise RuntimeError('Rollback recovery stopped: Caddy changed after r1')
 file_hashes.update({caddy:d.sha(caddy),caddy_backup:d.sha(caddy_backup)})
 for name in sorted(NAMES):
  recorded=state['services'][name];previous=original.get('services',{}).get(name,{})
  live=lives[name];labels=live.get('Config',{}).get('Labels')or{}
  project=recorded.get('project');service=recorded.get('service')
  if not isinstance(service,str) or not re.fullmatch(r'[A-Za-z0-9_.-]+',service) or not project or recorded.get('name')!=name or not live.get('State',{}).get('Running') or live.get('Image')!=recorded.get('old_image_id') or live.get('Image')!=previous.get('new_image_id') or previous.get('project')!=project or previous.get('service')!=service or labels.get('com.docker.compose.project')!=project or labels.get('com.docker.compose.service')!=service:raise RuntimeError('Rollback recovery stopped: running image or Compose identity differs for '+name)
  snapshot=regular(backup/(service+'-old.json'),backup)
  if recorded.get('old_config')!=str(snapshot) or labels.get('com.docker.compose.project.config_files','').split(',')!=[str(snapshot)]:raise RuntimeError('Rollback recovery stopped: effective Compose path differs from r1 rollback for '+name)
  prior_config=regular(previous.get('new_config',''))
  def normalized(file):
   value=d.jr(['docker','compose','-p',project,'-f',str(file),'config','--format','json'])
   entry=value.get('services',{}).get(service)
   if not isinstance(entry,dict):raise RuntimeError('Rollback recovery stopped: resolved service missing')
   entry['image']=live['Image'];entry['pull_policy']='never';entry.pop('build',None)
   return value
  file_hashes.update({snapshot:d.sha(snapshot),prior_config:d.sha(prior_config)})
  if normalized(prior_config)!=normalized(snapshot):raise RuntimeError('Rollback recovery stopped: resolved configuration content changed for '+name)
  updated['services'][name].update(new_config=str(snapshot),new_image_id=live['Image'])
 # Recheck every input before metadata writes, under the existing updater lock.
 if d.sha(active_file)!=original_sha or any(d.sha(file)!=expected for file,expected in file_hashes.items()):raise RuntimeError('Rollback recovery stopped: evidence changed during verification')
 for name in sorted(NAMES):
  now=d.image(name)
  if now.get('Image')!=lives[name].get('Image') or not now.get('State',{}).get('Running') or now.get('Config',{}).get('Labels')!=lives[name].get('Config',{}).get('Labels'):raise RuntimeError('Rollback recovery stopped: container changed during verification')
 d._check_active(updated,lives)
 audit=d.ROOT/'rollback-index-recovery.json'
 evidence={'source_state':str(state_file),'source_state_sha256':file_hashes[state_file],'previous_index':original,'previous_index_sha256':original_sha,'status':'verified-before-index-write'}
 if audit.exists():
  if json.loads(regular(audit,d.ROOT).read_text())!=evidence:raise RuntimeError('Rollback recovery stopped: existing audit describes different evidence')
 else:d.write(audit,evidence)
 d.write(active_file,updated)
 d.say('Verified r1 rollback: active Compose index now matches the unchanged running services.')
 return True
