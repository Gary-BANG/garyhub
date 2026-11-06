"""Check patch selection when a previously packaged release has just merged."""
import contextlib
import importlib.util
import io
import json
import os
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

UPDATER = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('checkpoint_builder', UPDATER/'build-push-package.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


class SourceCheckpointTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.repo = self.root/'repo'
        self.repo.mkdir()
        self.git('init', '-q')
        self.git('config', 'user.name', 'Fixture')
        self.git('config', 'user.email', 'fixture@example.invalid')
        src = self.repo/'scripts/updater/push-source.ps1'
        src.parent.mkdir(parents=True)
        src.write_bytes((UPDATER/'push-source.ps1').read_bytes())
        self.base = self.commit('before PR')
        self.partial = self.commit('first release')
        self.final = self.commit('next release')

    def git(self, *args, env=None):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], env=env).decode().strip()

    def commit(self, value):
        (self.repo/'README.md').write_text(value+'\n')
        self.git('add', '.')
        self.git('commit', '-qm', value)
        return self.git('rev-parse', 'HEAD')

    def test_each_reviewed_tree_builds_the_exact_target_index(self):
        earlier = self.git('rev-parse', self.partial+'^{tree}')
        package = self.root/'source.zip'
        with patch.object(builder, 'ROOT', self.repo), contextlib.redirect_stdout(io.StringIO()):
            builder.build(self.base, 'update/test', package, 'review', 'fixture', alternate_trees=[earlier])
        with zipfile.ZipFile(package) as z:
            z.extractall(self.root/'unpacked')
        folder = next((self.root/'unpacked').iterdir())
        m = json.loads((folder/'manifest.json').read_text())
        self.assertEqual(m['schema_version'], 2)
        self.assertEqual(m['target_tree'], self.git('rev-parse', self.final+'^{tree}'))
        self.assertEqual(len(m['source_patches']), 2)
        env = dict(os.environ, GIT_INDEX_FILE=str(self.root/'review.index'))
        for base in (self.base, self.partial):
            tree = self.git('rev-parse',base+'^{tree}')
            path = folder/m['source_patches'][tree]
            self.git('read-tree',tree,env=env)
            self.git('apply','--cached',str(path),env=env)
            self.assertEqual(self.git('write-tree',env=env),m['target_tree'])

    def test_source_recovery_exports_the_selected_release_only(self):
        package = self.root/'recovery.zip'
        with patch.object(builder,'ROOT',self.repo), contextlib.redirect_stdout(io.StringIO()):
            builder.build(self.base, 'update/fix', package, 'recover', 'fixture',
                          target=self.partial, alternate_trees=[])
        with zipfile.ZipFile(package) as z:
            name = next(n for n in z.namelist() if n.endswith('/manifest.json'))
            m = json.loads(z.read(name))
        self.assertEqual(m['source_commit'], self.partial)
        self.assertEqual(m['target_tree'], self.git('rev-parse',self.partial+'^{tree}'))
        self.assertEqual(list(m['files']),['README.md'])
