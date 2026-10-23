#!/usr/bin/env python3
"""Compact, read-only planning and checked dispatch to reviewed release builders."""
import argparse
import ast
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
VERSION = re.compile(r'\d+\.\d+\.\d+\.\d+\Z')
PROTECTIONS = {'reviewed_source_baseline', 'active_deployment_index',
               'consistent_data_backup', 'preserve_current_records_on_rollback',
               'health_and_https', 'release_notice_recipients_and_idempotency'}


def git(*args):
    p = subprocess.run(['git', '-C', str(ROOT), *args], capture_output=True, text=True)
    if p.returncode:
        raise ValueError('Git check failed: ' + p.stderr.strip()[:500])
    return p.stdout.strip()


def local_file(name):
    if not isinstance(name, str) or not name or '\\' in name:
        raise ValueError('Invalid repository path')
    p = ROOT / name
    if Path(name).is_absolute() or '..' in Path(name).parts or not p.resolve().is_relative_to(ROOT.resolve()):
        raise ValueError('Path escapes repository: ' + name)
    for part in [p, *p.parents]:
        if part == ROOT:
            break
        if part.is_symlink():
            raise ValueError('Linked input requires review: ' + name)
    if not p.is_file():
        raise ValueError('Required file missing: ' + name)
    return p


def read_json(name):
    return json.loads(local_file(name).read_text(encoding='utf-8-sig'))


def release(version=None):
    current = read_json('releases/current.json')
    if current.get('schema_version') != 1 or not VERSION.fullmatch(current.get('source_version', '')):
        raise ValueError('Invalid source-release pointer')
    v = version or current['source_version']
    if not VERSION.fullmatch(v):
        raise ValueError('Expected four-part release version')
    if current['manifest'] != 'releases/' + current['source_version'] + '.json':
        raise ValueError('Source pointer and manifest disagree')
    m = read_json('releases/' + v + '.json')
    if m.get('schema_version') != 1 or m.get('version') != v or not VERSION.fullmatch(m.get('requires_release', '')):
        raise ValueError('Invalid release manifest')
    adapter = 'scripts/releases/v' + v
    if m.get('adapter_dir') != adapter or m.get('builder') != adapter + '/build-package.py':
        raise ValueError('Builder must belong to the registered release')
    if not PROTECTIONS.issubset(set(m.get('protections', []))):
        raise ValueError('Release is missing required deployment protections')
    if m.get('capability_variants') != {'1.3.4.1': 'without_totp', '1.3.4.2': 'with_totp'}:
        raise ValueError('Capability variants require review')
    constants = {}
    for node in ast.parse(local_file(m['builder']).read_text()).body:
        if isinstance(node, ast.Assign) and isinstance(node.value, ast.Constant):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    constants[target.id] = node.value.value
    if constants.get('VERSION') != v or constants.get('BASE') != m.get('reviewed_base_commit'):
        raise ValueError('Builder constants do not match the reviewed release')
    if not re.fullmatch(r'[0-9a-f]{40}', m.get('reviewed_base_commit', '')):
        raise ValueError('Missing full reviewed base commit')
    git('cat-file', '-e', m['reviewed_base_commit'] + '^{commit}')
    for name in ['deploy.py', 'Install-GaryHub.template.ps1', 'RUN-UPDATE.cmd', 'ROLLBACK.cmd']:
        local_file(adapter + '/' + name)
    local_file(m['validation_record'])
    if m['production_verified'] not in [True, False]:
        raise ValueError('Production state must be explicit')
    return current, m


def group(name):
    if name.startswith(('scripts/', 'releases/')):
        return 'release-tooling'
    if name.startswith('docs/') or name in ['AGENTS.md', 'README.md']:
        return 'documentation'
    if name.startswith('lab-service/public/useful/'):
        return 'useful-tools'
    if name.startswith('lab-service/public/lab/') or name == 'lab-service/lab-distribution.cjs':
        return 'lab-workspace'
    if name.startswith('calendar-app/'):
        if any(x in name for x in ['auth', 'account', 'hub-api', 'password', 'membership', 'totp', 'app.js', 'db.js']):
            return 'identity-and-data'
        return 'calendar-features'
    if name.startswith('lab-service/'):
        return 'lab-service'
    return 'review-unmapped'


CHECKS = {
    'documentation': ['Check links and state claims; do not rerun runtime suites for prose alone.'],
    'release-tooling': ['Run updater tests and affected adapter/package/rollback tests; verify output hashes.'],
    'useful-tools': ['Exercise the changed browser tool, local-file boundaries, downloads and mobile layout.'],
    'lab-workspace': ['Run relevant Lab tests; for writes check identity, CSRF, isolation, revision conflicts and persistence.'],
    'identity-and-data': ['Run affected auth/data tests plus isolation, disabled-account, CSRF and persistence regressions.'],
    'calendar-features': ['Run tests for the changed feature and its data operations; check the affected page.'],
    'lab-service': ['Check route authorization and affected service regressions; verify Docker/source packaging when changed.'],
    'review-unmapped': ['Inspect unmapped paths and choose checks before making a release.'],
}


def plan(base):
    if not re.fullmatch(r'[A-Za-z0-9_./-]+', base) or base.startswith('-'):
        raise ValueError('Invalid reviewed base ref')
    git('cat-file', '-e', base + '^{commit}')
    names = set(git('diff', '--name-only', base, '--').splitlines())
    names.update(git('ls-files', '--others', '--exclude-standard').splitlines())
    groups = {}
    for name in sorted(filter(None, names)):
        groups.setdefault(group(name), []).append(name)
    return {'base_commit': git('rev-parse', base + '^{commit}'), 'changed_count': len(names),
            'groups': {k: {'count': len(v), 'sample_paths': v[:8], 'checks': CHECKS[k]} for k, v in groups.items()},
            'production_gates': 'For an application deployment: actual base/variant, effective config, backups, applicable isolated checks, health/HTTPS and release-notice verification.',
            'execution': 'Plan only; no tests, build, network deployment or writes performed.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('context')
    p = commands.add_parser('plan'); p.add_argument('--base', required=True)
    commands.add_parser('check')
    p = commands.add_parser('build'); p.add_argument('--release', required=True); p.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        if args.command == 'plan':
            result = plan(args.base)
        else:
            current, m = release(getattr(args, 'release', None))
            if args.command == 'context':
                result = {'source_version': current['source_version'], 'branch': git('branch', '--show-current'),
                          'production_status': current['production_status'], 'requires_release': m['requires_release'],
                          'manifest': current['manifest'], 'read_next': ['docs/PROJECT_CONTEXT.md', 'docs/UPDATE_WORKFLOW.md'],
                          'adapter': m['adapter_dir'], 'note': 'Source state only; production requires server evidence.'}
            elif args.command == 'check':
                for service in ['calendar-app', 'lab-service']:
                    if read_json(service + '/public/privacy-ledger-release.json')['version'] != current['source_version']:
                        raise ValueError('Source version mismatch in ' + service)
                result = {'ok': True, 'source_version': current['source_version'], 'scope': 'Manifest, adapter constants, required paths and source version only; runtime checks are separate.'}
            else:
                output = Path(args.output).expanduser().resolve()
                if output.suffix.lower() != '.zip' or output.exists():
                    raise ValueError('Choose a new .zip output path; existing files are preserved')
                subprocess.run([sys.executable, str(local_file(m['builder'])), str(output)], cwd=ROOT, check=True)
                return 0
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (ValueError, KeyError, OSError, TypeError, subprocess.CalledProcessError) as e:
        print('STOPPED: ' + str(e)[:1000], file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
