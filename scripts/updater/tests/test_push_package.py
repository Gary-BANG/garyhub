"""Run the actual PowerShell push helper against a disposable local bare remote."""
import hashlib
import json
import os
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path

PACKAGE = os.environ.get('GARYHUB_PUSH_TEST_PACKAGE')
PWSH = os.environ.get('GARYHUB_TEST_PWSH')
ROOT = Path(__file__).resolve().parents[3]


@unittest.skipUnless(PACKAGE and PWSH, 'Set GARYHUB_PUSH_TEST_PACKAGE and GARYHUB_TEST_PWSH for isolated push-package tests')
class PushPackageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='garyhub-push-test-'); self.root = Path(self.tmp.name)/'中文 paths with spaces'; self.root.mkdir()
        with zipfile.ZipFile(PACKAGE) as z: z.extractall(self.root/'package')
        self.package = next((self.root/'package').iterdir())
        self.manifest = json.loads((self.package/'manifest.json').read_text())
        self.repo = self.root/'repo'; self.bare = self.root/'remote.git'
        self.git(ROOT, 'clone', '--quiet', '--shared', str(ROOT), str(self.repo))
        self.git(self.repo, 'checkout', '--quiet', '--detach', self.manifest['base_commit'])
        # A release may be built on the same review branch it exports. Clones
        # inherit that branch; remove it only in these disposable fixtures so
        # PrepareOnly actually exercises creation of a new isolated worktree.
        if self.git(self.repo, 'branch', '--list', self.manifest['branch']):
            self.git(self.repo, 'branch', '-D', self.manifest['branch'])
        self.git(self.repo, 'config', 'user.name', 'Synthetic Maintainer')
        self.git(self.repo, 'config', 'user.email', 'test@example.invalid')
        self.git(ROOT, 'clone', '--quiet', '--bare', '--shared', str(ROOT), str(self.bare))
        if self.git(self.bare, 'branch', '--list', self.manifest['branch']):
            self.git(self.bare, 'branch', '-D', self.manifest['branch'])
        self.git(self.bare, 'update-ref', 'refs/heads/main', self.manifest['base_commit'])
        self.git(self.bare, 'config', 'receive.shallowUpdate', 'true')
        self.git(self.repo, 'remote', 'set-url', 'origin', 'https://github.com/Gary-BANG/garyhub.git')
        self.env = {**os.environ, 'LOCALAPPDATA': str(self.root/'appdata'),
                    'GIT_CONFIG_COUNT': '1',
                    'GIT_CONFIG_KEY_0': 'url.'+self.bare.as_uri()+'.insteadOf',
                    'GIT_CONFIG_VALUE_0': 'https://github.com/Gary-BANG/garyhub.git'}
        # Only the PR browser opening is stubbed; the real script and all Git operations run.
        self.wrapper = self.root/'invoke.ps1'
        self.wrapper.write_text('function global:Start-Process { param($FilePath) Write-Output "PR URL captured for synthetic test" }\n& $args[0] -Repo $args[1]\nexit $LASTEXITCODE\n')

    def tearDown(self): self.tmp.cleanup()

    @staticmethod
    def git(at, *args):
        p = subprocess.run(['git', '-C', str(at), *args], capture_output=True, text=True)
        if p.returncode: raise AssertionError(p.stderr)
        return p.stdout.strip()

    def invoke(self, prepare=False):
        script = self.package/'Push-GitHub.ps1'
        args = [PWSH, '-NoLogo', '-NoProfile', '-File']
        args += [str(script), '-Repo', str(self.repo), '-PrepareOnly'] if prepare else [str(self.wrapper), str(script), str(self.repo), str(self.package)]
        return subprocess.run(args, env=self.env, capture_output=True, text=True)

    def test_checksums_isolated_apply_push_replay_and_unrelated_work_protection(self):
        for name, digest in self.manifest['package_files'].items():
            self.assertEqual(hashlib.sha256((self.package/name).read_bytes()).hexdigest(), digest)
        (self.repo/'README.md').write_text('UNCOMMITTED USER CONTENT\n')
        branch_before = self.git(self.repo, 'rev-parse', 'HEAD')
        p = self.invoke(prepare=True); self.assertEqual(p.returncode, 0, p.stdout+p.stderr)
        self.assertEqual((self.repo/'README.md').read_text(), 'UNCOMMITTED USER CONTENT\n')
        self.assertEqual(self.git(self.repo, 'rev-parse', 'HEAD'), branch_before)
        branch = self.manifest['branch']
        commit = self.git(self.repo, 'rev-parse', branch)
        for name, expected in self.manifest['files'].items():
            self.assertEqual(self.git(self.repo, 'rev-parse', branch+':'+name), expected['git_blob'])
        p = self.invoke(); self.assertEqual(p.returncode, 0, p.stdout+p.stderr)
        self.assertEqual(self.git(self.bare, 'rev-parse', 'refs/heads/'+branch), commit)
        self.assertEqual(self.git(self.bare, 'rev-parse', 'main'), self.manifest['base_commit'])
        p = self.invoke(); self.assertEqual(p.returncode, 0, p.stdout+p.stderr)
        self.assertEqual(self.git(self.bare, 'rev-parse', 'refs/heads/'+branch), commit)
        worktrees = self.git(self.repo, 'worktree', 'list', '--porcelain')
        work = Path([line[9:] for line in worktrees.splitlines() if line.startswith('worktree ')][1])
        (work/'unrelated.txt').write_text('Synthetic later work')
        self.git(work, 'add', 'unrelated.txt'); self.git(work, 'commit', '--quiet', '-m', 'Synthetic unrelated change')
        p = self.invoke(); self.assertNotEqual(p.returncode, 0)
        self.assertIn('unrelated changes', p.stdout)
        self.assertEqual(self.git(self.bare, 'rev-parse', 'refs/heads/'+branch), commit)

    def test_tampered_patch_stops_before_creating_a_branch(self):
        with (self.package/'changes.patch').open('ab') as f: f.write(b'CORRUPTED')
        p = self.invoke(); self.assertNotEqual(p.returncode, 0)
        self.assertIn('checksum mismatch', p.stdout)
        self.assertEqual(self.git(self.repo, 'branch', '--list', self.manifest['branch']), '')


if __name__ == '__main__': unittest.main()
