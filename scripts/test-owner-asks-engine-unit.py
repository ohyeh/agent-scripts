#!/usr/bin/env python3
"""Exercise the launcher and input handshake without starting Claude or tmux."""
import ast
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import unittest

SCRIPT = Path(__file__).with_name('test-owner-asks-engine.py')


def functions(**overrides):
    tree = ast.parse(SCRIPT.read_text())
    namespace = dict(Path=Path, os=os, json=json, time=time, subprocess=subprocess,
                     sys=__import__('sys'), shlex=__import__('shlex'),
                     REPO=SCRIPT.parent.parent, RUN=Path('/fixture'), FIXTURE=Path('/fixture'),
                     SID='fixture', SESSION='fixture', submissions=[],
                     ASKS_PLUGIN=SCRIPT.parent.parent / 'mods/owner-asks', ASKS_NAME='owner-asks')
    # Import only functions: the script's top-level code creates real session files.
    exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef)], type_ignores=[]), str(SCRIPT), 'exec'), namespace)
    namespace.update(overrides)
    return namespace


class SubmissionTests(unittest.TestCase):
    def test_empty_composer_suggestion_is_not_a_pending_prompt(self):
        namespace = functions()
        self.assertEqual(namespace['composer']('❯ Try "refactor a file"'), '')
        self.assertEqual(namespace['composer']('❯ Run the fixture'), 'Run the fixture')
        self.assertIsNone(namespace['composer']('Loading the editor'))

    def test_tmux_server_environment_is_cleaned_at_engine_exec(self):
        shells = []
        namespace = functions(tmux=lambda *args: shells.append(args[-1]) if args[0] == 'new-session' else '',
                              screen=lambda: '❯\n⏵⏵ bypass permissions on')
        namespace['launch']()
        with tempfile.TemporaryDirectory(dir=SCRIPT.parent.parent / '.workflow') as folder:
            binary = Path(folder) / 'claude'
            binary.write_text('#!/usr/bin/env python3\nimport json,os\nprint(json.dumps(dict(os.environ)))\n')
            binary.chmod(0o700)
            dirty = dict(os.environ, PATH=folder + os.pathsep + os.environ['PATH'],
                         CLAUDECODE='1', CLAUDE_PID='999999', CLAUDE_CODE_SESSION_ID='parent',
                         CLAUDE_CODE_MESSAGING_SOCKET='/dummy', CLAUDE_CODE_MESSAGING_TOKEN='dummy',
                         CLAUDE_CODE_ENABLE_FUNCTION_HOOKS='1')
            result = subprocess.run(['sh', '-c', shells[0]], env=dirty, capture_output=True, text=True, check=True)
            child = json.loads(result.stdout)
        self.assertEqual(child['HOME'], dirty['HOME'])
        self.assertEqual(child['PATH'], dirty['PATH'])
        self.assertEqual(child['CLAUDE_CODE_ENABLE_FUNCTION_HOOKS'], '1')
        self.assertFalse(any(k == 'CLAUDECODE' or k == 'CLAUDE_PID' or k.startswith('CLAUDE_CODE_') and k != 'CLAUDE_CODE_ENABLE_FUNCTION_HOOKS' for k in child))

    def test_waits_for_render_and_confirms_submission(self):
        pending = ''
        draft = ''
        stored = []

        def screen():
            nonlocal draft
            draft = pending if not stored else ''
            return '❯ ' + draft + '\n────────────────\n⏵⏵ bypass permissions on'

        def tmux(*args):
            nonlocal pending
            if '-l' in args:
                pending = args[-1]
            elif args[-1] == 'Enter' and draft:
                stored.append({'uuid': 'owner-1', 'type': 'user', 'message': {'content': draft}})
            return ''

        namespace = functions(screen=screen, tmux=tmux, rows=lambda: stored)
        namespace['send']('Reply exactly fixture marker.')
        self.assertEqual(len(stored), 1)


if __name__ == '__main__':
    unittest.main()
