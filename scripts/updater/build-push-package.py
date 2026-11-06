#!/usr/bin/env python3
"""Package an explicitly reviewed, committed GaryHub diff for Windows Git push."""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def git(*args):
    return subprocess.check_output(['git', '-C', str(ROOT), *args])


def build(base, branch, output, subject, pr_body, *, target='HEAD', alternate_trees=None, readme_text=None):
    if not re.fullmatch(r'(chore|update)/[a-z0-9][a-z0-9._-]{0,100}', branch):
        raise ValueError('Choose a review branch under chore/ or update/')
    if not subject or len(subject) > 160 or '\n' in subject or '\r' in subject:
        raise ValueError('Use a short single-line commit subject')
    base = git('rev-parse', '--verify', base + '^{commit}').decode().strip()
    target = git('rev-parse', '--verify', target + '^{commit}').decode().strip()
    git('merge-base', '--is-ancestor', base, target)
    base_tree = git('rev-parse', base + '^{tree}').decode().strip()
    target_tree = git('rev-parse', target + '^{tree}').decode().strip()
    # An installer can ship several reviewed source checkpoints while retaining
    # its independent, stricter server version and image preflight.
    patches = {base_tree: 'changes.patch'}
    if alternate_trees is not None:
        for tree in alternate_trees:
            if not re.fullmatch('[0-9a-f]{40}', tree) or git('cat-file', '-t', tree).strip() != b'tree':
                raise ValueError('Expected a reviewed Git tree for the source checkpoint')
            if tree not in (base_tree, target_tree):
                patches[tree] = 'changes-from-' + tree + '.patch'
    paths = set()
    for tree in patches:
        names = git('diff', '--name-only', '--no-renames', '-z', tree, target).decode().split('\0')
        paths.update(name for name in names if name)
    paths = sorted(paths)
    if not paths:
        raise ValueError('No committed changes to package')
    files = {}
    for name in paths:
        if not re.fullmatch(r'[A-Za-z0-9_./-]+', name) or any(x in Path(name).parts for x in ['..', '.git', 'node_modules', 'private', 'private-backup']):
            raise ValueError('Unreviewed package path: ' + name)
        if any(x.lower().startswith('.env') and x != '.env.example' for x in Path(name).parts) or Path(name).suffix.lower() in ['.db', '.sqlite', '.sqlite3', '.pem', '.key'] or Path(name).name in ['homepage-protected.json', 'profile-private.json', 'garyhub-active-deployment.json']:
            raise ValueError('Refusing private input: ' + name)
        if '/data/' in '/' + name and not name.startswith('lab-service/public/lab/data/'):
            raise ValueError('Runtime data requires review: ' + name)
        entry = git('ls-tree', target, '--', name).decode().split()
        if not entry or entry[0] != '100644':
            raise ValueError('Only ordinary source files are supported; review deletions/links/modes: ' + name)
        data = git('show', target + ':' + name)
        files[name] = {'git_blob': entry[2], 'sha256': hashlib.sha256(data).hexdigest()}
    ps = git('show', 'HEAD:scripts/updater/push-source.ps1')
    root = Path(tempfile.mkdtemp(prefix='garyhub-push-')) / 'GaryHub-Workflow-GitHub-Push'
    root.mkdir()
    (root/'Push-GitHub.ps1').write_bytes(ps)
    for tree, name in patches.items():
        (root/name).write_bytes(git('diff', '--binary', '--full-index', '--no-renames', tree, target, '--', *paths))
    (root/'PR-DESCRIPTION.md').write_text(pr_body, encoding='utf-8')
    cmd = '@echo off\nsetlocal\nchcp 65001 >nul\npowershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Push-GitHub.ps1" -PackageRoot "%~dp0."\nset "PUSH_RESULT=%ERRORLEVEL%"\necho.\npause\nexit /b %PUSH_RESULT%\n'
    (root/'PUSH-TO-GITHUB.cmd').write_bytes(cmd.replace('\n', '\r\n').encode())
    readme = '''# GaryHub GitHub push 包

完整解压后双击 PUSH-TO-GITHUB.cmd。默认仓库为 D:\\Codes\\Own_Project\\garyhub，沿用现有 GitHub 凭据。

程序获取最新 main，在独立工作目录检查并导入补丁、提交，普通 push 到审查分支，然后打开 GitHub PR 页面。请核对改动并创建、合并 PR。PR 正文可用 PR-DESCRIPTION.md。

原工作区和未提交内容保留。不会 force push、自动合并 main、连接生产 SSH 或部署服务器。工作目录路径显示为 REVIEW_WORKTREE=...，保留供检查；重复运行会验证并复用已准备的分支。

首次完成可能需要 GitHub 登录或 SSH 私钥口令。显示 STOPPED 时保存末尾输出；不要强行覆盖或删除原工作。补丁不匹配、分支含其他改动时会停止。

自定义仓库位置：在 PowerShell 中运行 & '.\\Push-GitHub.ps1' -Repo '你的仓库路径'。加 -PrepareOnly 可只准备本机提交，不推送。

本包仅提交固定更新流程、项目档案及统一工具；应用版本仍为 1.3.6.0。验证记录位于 docs/UPDATE_WORKFLOW_VALIDATION.md。
'''
    (root/'README.md').write_text(readme_text or readme, encoding='utf-8')
    manifest = {'schema_version': 1, 'repository': 'Gary-BANG/garyhub', 'base_commit': base,
                'source_commit': target, 'branch': branch,
                'commit_message': subject, 'files': files,
                'package_files': {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in root.iterdir() if p.is_file()}}
    if alternate_trees is not None:
        manifest.update(schema_version=2, target_tree=target_tree, source_patches=patches)
    (root/'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    output = Path(output).resolve()
    if output.exists():
        raise ValueError('Existing output preserved; choose a new file')
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as z:
        for p in sorted(root.iterdir()):
            z.write(p, root.name + '/' + p.name)
    print(json.dumps({'output': str(output), 'files': len(files), 'size': output.stat().st_size,
                      'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}, indent=2))


if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--base', required=True); p.add_argument('--branch', required=True)
    p.add_argument('--output', required=True); p.add_argument('--subject', required=True)
    p.add_argument('--pr-body', required=True)
    a = p.parse_args()
    build(a.base, a.branch, a.output, a.subject, Path(a.pr_body).read_text(encoding='utf-8'))
