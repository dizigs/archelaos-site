"""CLI option boundaries, fixed script dispatch and interpreter-state recovery."""
import argparse
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / 'rebuild/tools/toolbox.py'
spec = importlib.util.spec_from_file_location('toolbox_security_subject', SCRIPT)
toolbox = importlib.util.module_from_spec(spec)
spec.loader.exec_module(toolbox)


class ToolboxSecurityTests(unittest.TestCase):
    def test_preview_filename_cannot_become_downstream_help(self):
        result = subprocess.run([sys.executable, str(SCRIPT), 'preview', '--manifest=--help'], capture_output=True, text=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn('usage: quick_edit.py', result.stdout)

    def test_find_option_like_phrase_remains_literal(self):
        result = subprocess.run([sys.executable, str(SCRIPT), 'find', '--json', '--', '--limit=1000'], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        import json
        self.assertEqual(json.loads(result.stdout)['query'], '--limit=1000')

    def test_draft_values_round_trip_without_becoming_flags(self):
        values = ['--save', '--after=changed', '$(touch NEVER); --save']
        seen = []
        def child(*args, **kwargs):
            parser = argparse.ArgumentParser()
            for key in ['person', 'field', 'before', 'after', 'reason']:
                parser.add_argument('--' + key, required=True)
            parser.add_argument('--save', action='store_true')
            seen.append(parser.parse_args())
        argv = ['toolbox.py', 'draft', '--person=Example', '--field=bio', '--before=' + values[0], '--after=' + values[1], '--reason=' + values[2]]
        with patch.object(sys, 'argv', argv), patch('runpy.run_path', side_effect=child):
            self.assertEqual(toolbox.main(), 0)
        self.assertEqual((seen[0].before, seen[0].after, seen[0].reason), tuple(values))
        self.assertFalse(seen[0].save)

    def test_arbitrary_runner_is_rejected_before_execution(self):
        with patch('runpy.run_path') as invoke:
            with self.assertRaises(ValueError):
                toolbox.run('../../unreviewed.py')
            invoke.assert_not_called()

    def test_system_exit_restores_argv_path_and_cwd(self):
        argv, path, cwd = sys.argv, sys.path, os.getcwd()
        def child(*args, **kwargs):
            os.chdir('/tmp')
            raise SystemExit(7)
        with patch('runpy.run_path', side_effect=child):
            self.assertEqual(toolbox.run('find', ['--', 'literal']), 7)
        self.assertIs(sys.argv, argv)
        self.assertIs(sys.path, path)
        self.assertEqual(os.getcwd(), cwd)

    def test_fixed_dispatch_does_not_spawn_os_command(self):
        with patch('runpy.run_path', return_value={}) as invoke, patch('subprocess.run') as spawn:
            self.assertEqual(toolbox.run('find', ['--', 'literal']), 0)
            spawn.assert_not_called()
        self.assertEqual(Path(invoke.call_args.args[0]), ROOT / 'rebuild/tools/find_references.py')
        self.assertEqual(invoke.call_args.kwargs['run_name'], '__main__')


if __name__ == '__main__':
    unittest.main()
