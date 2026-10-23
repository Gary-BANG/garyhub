import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('manage', Path(__file__).resolve().parents[1] / 'manage.py')
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)


class WorkflowTests(unittest.TestCase):
    def test_current_source_matches_the_registered_adapter(self):
        current, release = m.release()
        self.assertEqual(current['source_version'], release['version'])
        self.assertEqual(release['version'], '1.3.6.1')
        self.assertFalse(release['production_verified'])

    def test_unknown_version_and_path_escape_are_rejected(self):
        with self.assertRaises(ValueError): m.release('../1.3.6.0')
        for name in ['../private.json', '/tmp/x', 'scripts\\updater\\manage.py']:
            with self.subTest(name=name), self.assertRaises(ValueError): m.local_file(name)

    def test_linked_inputs_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root/'real').write_text('fixture'); (root/'alias').symlink_to(root/'real')
            with patch.object(m, 'ROOT', root), self.assertRaises(ValueError): m.local_file('alias')

    def test_manifest_cannot_dispatch_to_another_release(self):
        original = m.read_json
        def altered(name):
            obj = original(name)
            if name == 'releases/'+original('releases/current.json')['source_version']+'.json': obj['builder'] = 'scripts/anything.py'
            return obj
        with patch.object(m, 'read_json', side_effect=altered), self.assertRaises(ValueError): m.release()

    def test_mismatched_builder_base_is_rejected(self):
        original = m.read_json
        def altered(name):
            obj = original(name)
            if name == 'releases/'+original('releases/current.json')['source_version']+'.json': obj['reviewed_base_commit'] = '0'*40
            return obj
        with patch.object(m, 'read_json', side_effect=altered), self.assertRaises(ValueError): m.release()

    def test_plan_is_bounded_and_keeps_unknown_files_visible(self):
        def fake(*args):
            if args[0] == 'diff': return '\n'.join(['lab-service/public/useful/vendor/file'+str(i) for i in range(90)]+['other.txt'])
            if args[0] == 'rev-parse': return 'a'*40
            return ''
        with patch.object(m, 'git', side_effect=fake): result = m.plan('HEAD')
        self.assertEqual(result['changed_count'], 91)
        self.assertEqual(len(result['groups']['useful-tools']['sample_paths']), 8)
        self.assertIn('review-unmapped', result['groups'])
        self.assertLess(len(json.dumps(result)), 2400)


if __name__ == '__main__': unittest.main()
