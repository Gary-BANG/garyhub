"""Build a registered source-only upgrade using reviewed base files and shared tools."""
import contextlib
import hashlib
import importlib.util
import io
import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


def normalized(data):
    return digest(data.replace(b'\r\n', b'\n').rstrip(b'\n'))


def excluded(path):
    p = Path(path)
    if any(part.lower() in {'node_modules', '__pycache__', '.git', 'data', 'private', 'private-backup'} for part in p.parts):
        return True
    if any(part.lower().startswith('.env') and part.lower() != '.env.example' for part in p.parts):
        return True
    return p.name.lower() in {'homepage-protected.json', 'profile-private.json', 'deployment-state.json', 'garyhub-active-deployment.json'} or p.suffix.lower() in {'.db', '.sqlite', '.sqlite3', '.pem', '.key', '.env'} or p.name.lower().endswith(('.db-wal', '.db-shm', '.sqlite-wal', '.sqlite-shm'))


def source_bytes(root, relative):
    p = root / relative
    if excluded(relative) or not p.resolve().is_relative_to(root.resolve()):
        raise RuntimeError('Refusing private or escaping package input: ' + relative)
    for part in [p, *p.parents]:
        if part == root:
            break
        if part.is_symlink():
            raise RuntimeError('Linked package input requires review: ' + relative)
    return p.read_bytes()


def build(root, here, output):
    root, here, output = Path(root).resolve(), Path(here).resolve(), Path(output).resolve()
    config = json.loads(source_bytes(root, str((here/'release-config.json').relative_to(root))))
    version, base, build_id = config['version'], config['reviewed_base_commit'], config['installer_build']
    registry = json.loads(source_bytes(root, 'releases/' + version + '.json'))
    if registry['reviewed_base_commit'] != base or registry['requires_release'] != config['requires_release']:
        raise RuntimeError('Release configuration does not match registry')
    def git(*args):
        return subprocess.check_output(['git', '-C', str(root), *args])
    if git('status', '--porcelain').strip():
        raise RuntimeError('Commit and review source changes before building')
    if output.exists():
        raise RuntimeError('Existing output preserved; choose a new ZIP path')
    paths = [p for p in git('diff', '--name-only', base, 'HEAD', '--').decode().splitlines() if p]
    runtime = [p for p in paths if p.startswith(('calendar-app/', 'lab-service/')) and not p.endswith('/Dockerfile')]
    if not runtime:
        raise RuntimeError('No reviewed application changes found')
    for path in runtime:
        source_bytes(root, path)
    def old(path, variant):
        choices = [path]
        if variant == '1.3.4.1':
            choices.insert(0, config['baseline_adapter']+'/variant-overrides/'+variant+'/'+path)
        for choice in choices:
            p = subprocess.run(['git', '-C', str(root), 'show', base+':'+choice], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
            if p.returncode == 0:
                return p.stdout
        return None
    work = Path(tempfile.mkdtemp(prefix='garyhub-upgrade-'))
    bundle, outer = work/'payload', work/('GaryHub-'+build_id)
    bundle.mkdir(); outer.mkdir()
    def put(path, data):
        target=bundle/path;target.parent.mkdir(parents=True, exist_ok=True);target.write_bytes(data)
    manifest={'release':'v'+version, 'installer_build':build_id, 'base_commit':base, 'requires_release':config['requires_release'], 'variants':{}, 'files':{}}
    for variant in ['1.3.4.1', '1.3.4.2']:
        baselines={'calendar-app':{}, 'garyhub-lab':{}};new_paths={key:[] for key in baselines}
        excluded_for_variant=config.get('variant_exclusions',{}).get(variant,[])
        if not isinstance(excluded_for_variant,list) or any(p not in runtime for p in excluded_for_variant):
            raise RuntimeError('Variant exclusion does not match a reviewed runtime file')
        for path in runtime:
            if path in excluded_for_variant:
                continue
            service='calendar-app' if path.startswith('calendar-app/') else 'garyhub-lab'
            short=path.split('/',1)[1]
            override=here/'variant-overrides'/variant/path
            data=source_bytes(root, str(override.relative_to(root)) if override.is_file() else path)
            before=old(path,variant)
            if before is None:new_paths[service].append(short)
            else:baselines[service][short]=[normalized(before)]
            put('payload/'+variant+'/'+path,data)
        manifest['variants'][variant]={'baselines':baselines,'new_paths':new_paths}
    for name in ['deploy.py','release-config.json','README.md','TEST-RESULTS.md']:
        put(name,source_bytes(root,str((here/name).relative_to(root))))
    put('deploy_runtime.py',source_bytes(root,'scripts/updater/deploy_runtime.py'))
    for target, source in config.get('support_files', {}).items():
        if Path(target).is_absolute() or '..' in Path(target).parts or '\\' in target or excluded(target):
            raise RuntimeError('Invalid support-file destination')
        put(target, source_bytes(root, source))
    for name,path in config['test_inputs'].items():
        if Path(name).name!=name:
            raise RuntimeError('Invalid isolated test filename')
        put('tests/'+name,source_bytes(root,path))
    # Reuse the established isolated-worktree source importer, with this release's
    # committed patch and exact blob manifest. Production capability variants do
    # not overwrite the maintainer's canonical Git working tree.
    spec=importlib.util.spec_from_file_location('garyhub_push_builder',root/'scripts/updater/build-push-package.py')
    push=importlib.util.module_from_spec(spec);spec.loader.exec_module(push);push.ROOT=root
    pr_body=source_bytes(root,str((here/'PR-DESCRIPTION.md').relative_to(root))).decode()
    with contextlib.redirect_stdout(io.StringIO()):
        push.build(base,'update/garyhub-v'+version,work/'git-source.zip',config.get('source_subject','Add bilingual useful tools and Markdown ZIP preview'),pr_body)
    with zipfile.ZipFile(work/'git-source.zip') as z:
        for name in z.namelist():
            relative='/'.join(name.split('/')[1:])
            if relative:
                put('git-source/'+relative,z.read(name))
    source_readme=('GaryHub v'+version+' source update\n\nRun PUSH-TO-GITHUB.cmd in the outer upgrade folder. The existing importer preserves your working tree, prepares an update branch and opens the PR page. Review and merge main on GitHub.\n').encode()
    put('git-source/README.md',source_readme)
    git_manifest=json.loads((bundle/'git-source/manifest.json').read_text())
    git_manifest['package_files']['README.md']=digest(source_readme)
    put('git-source/manifest.json',json.dumps(git_manifest,indent=2).encode())
    for p in sorted(bundle.rglob('*')):
        if p.is_file():manifest['files'][p.relative_to(bundle).as_posix()]=digest(p.read_bytes())
    put('manifest.json',json.dumps(manifest,indent=2).encode())
    payload=outer/'payload.zip'
    with zipfile.ZipFile(payload,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(bundle.rglob('*')):
            if p.is_file():z.write(p,p.relative_to(bundle).as_posix())
    template=source_bytes(root,str((here/'Install-GaryHub.template.ps1').relative_to(root))).decode('utf-8-sig')
    for key,value in {'PACKAGE_SHA256':digest(payload.read_bytes()),'INSTALLER_BUILD_ID':build_id,'RELEASE_VERSION':version,'REQUIRES_VERSION':config['requires_release']}.items():
        template=template.replace(key,value)
    (outer/'Install-GaryHub.ps1').write_text(template.replace('\r\n','\n'),encoding='utf-8-sig')
    for name in ['README.md','TEST-RESULTS.md','RUN-UPDATE.cmd','ROLLBACK.cmd']:
        data=source_bytes(root,str((here/name).relative_to(root)))
        if name.endswith('.cmd'):data=data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')
        (outer/name).write_bytes(data)
    for name, source in config.get('outer_files', {}).items():
        if Path(name).name != name or '\\' in name or excluded(name) or (outer/name).exists():
            raise RuntimeError('Invalid extra installer file')
        data=source_bytes(root,source)
        if source.endswith('.template.ps1'):
            text=data.decode('utf-8-sig')
            for key,value in {'PACKAGE_SHA256':digest(payload.read_bytes()),'INSTALLER_BUILD_ID':build_id,'RELEASE_VERSION':version,'REQUIRES_VERSION':config['requires_release']}.items():
                text=text.replace(key,value)
            data=b'\xef\xbb\xbf'+text.encode()
        if name.endswith('.cmd'):data=data.replace(b'\r\n',b'\n').replace(b'\n',b'\r\n')
        (outer/name).write_bytes(data)
    shutil.copytree(bundle/'git-source',outer/'git-source')
    cmd='@echo off\nsetlocal\nchcp 65001 >nul\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0git-source\\Push-GitHub.ps1" -PackageRoot "%~dp0git-source"\nset "PUSH_RESULT=%ERRORLEVEL%"\necho.\npause\nexit /b %PUSH_RESULT%\n'
    (outer/'PUSH-TO-GITHUB.cmd').write_bytes(cmd.replace('\n','\r\n').encode())
    (outer/'SHA256SUMS.txt').write_text(''.join(digest(p.read_bytes())+'  '+p.relative_to(outer).as_posix()+'\n' for p in sorted(outer.rglob('*')) if p.is_file()))
    output.parent.mkdir(parents=True,exist_ok=True)
    temporary=output.with_name(output.name+'.partial')
    if temporary.exists():
        raise RuntimeError('An interrupted output archive exists; review before building')
    with zipfile.ZipFile(temporary,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in sorted(outer.rglob('*')):
            if p.is_file():z.write(p,outer.name+'/'+p.relative_to(outer).as_posix())
    if output.exists():
        raise RuntimeError('Output appeared during build; existing file preserved')
    os.replace(temporary,output)
    report={'file':str(output),'size':output.stat().st_size,'sha256':digest(output.read_bytes()),'payload_files':len(manifest['files']),'runtime_paths':runtime,'work':str(work)}
    print(json.dumps(report,indent=2));return report
