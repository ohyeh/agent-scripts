#!/usr/bin/env python3
"""Run the candidate in a real interactive engine. Keep all evidence in a new run dir."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import time
import uuid

REPO = Path(__file__).resolve().parent.parent
RUN = REPO / '.workflow' / (time.strftime('%Y%m%d%H%M%S') + '-asks040-engine')
RUN.mkdir(parents=True)
FIXTURE = RUN / 'fixture'
FIXTURE.mkdir()
SID = str(uuid.uuid4())
SESSION = 'asks040-' + SID[:8]
ROOT = Path.home() / '.local/state/owner-asks' / SID
SOURCE = ROOT / 'owner.asks.jsonl'
PROJECTION = Path.home() / '.local/state/agent-hooks' / SID / 'asks-open.md'
TRANSCRIPT = Path.home() / '.claude/projects' / str(FIXTURE).replace('/', '-').replace('.', '-') / (SID + '.jsonl')
results = []


def tmux(*args):
    return subprocess.check_output(['tmux', *args], text=True)


def screen():
    return tmux('capture-pane', '-p', '-t', SESSION, '-S', '-200')


def rows():
    if not TRANSCRIPT.exists():
        # Claude sanitizes non-alphanumeric path characters.
        found = list((Path.home() / '.claude/projects').glob('*/' + SID + '.jsonl'))
        if found:
            return [json.loads(s) for s in found[0].read_text().splitlines() if s.strip()]
        return []
    return [json.loads(s) for s in TRANSCRIPT.read_text().splitlines() if s.strip()]


def records():
    return [json.loads(s) for s in SOURCE.read_text().splitlines() if s.strip()] if SOURCE.exists() else []


def wait(label, predicate, seconds=150):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(.5)
    (RUN / ('timeout-' + label + '.txt')).write_text(screen())
    raise RuntimeError('timeout: ' + label)


def send(text):
    # Printed evidence also satisfies the user's normal completion hook.
    text = text.replace('printf ASK040_', "printf 'exit 0\\n'; printf ASK040_")
    tmux('send-keys', '-t', SESSION, '-l', text)
    tmux('send-keys', '-t', SESSION, 'Enter')


def assistant_text(row):
    content = row.get('message', {}).get('content', [])
    if not isinstance(content, list):
        return ''
    return '\n'.join(b.get('text', '') for b in content if b.get('type') == 'text')


def answered(marker):
    return any(r.get('type') == 'assistant' and marker in assistant_text(r) and r.get('message', {}).get('stop_reason') != 'tool_use' for r in rows())


def tool_started(marker):
    return any(marker in json.dumps(b) for r in rows() for b in r.get('message', {}).get('content', []) if isinstance(b, dict) and b.get('type') == 'tool_use')


def check(name, ok, detail):
    line = ('PASS' if ok else 'FAIL') + ' ' + name + ': ' + detail
    print(line, flush=True)
    results.append((ok, line))


def launch(resume=False):
    command = ['claude', '--plugin-dir', str(REPO / 'mods/owner-asks'), '--plugin-dir', str(REPO / 'mods/agent-should-know'), '--plugin-dir', str(RUN / 'relay-fixture'),
               '--dangerously-skip-permissions', '--debug-file', str(RUN / ('resume.debug' if resume else 'engine.debug')),
               '--append-system-prompt', 'Acceptance fixture. Follow only the supplied test prompt. Never read owner files, change plugins, delegate, push, or install. Use Bash only for the exact harmless printf/sleep command requested. Reply with the requested marker.']
    command += ['--resume' if resume else '--session-id', SID]
    shell = 'CLAUDE_CODE_ENABLE_FUNCTION_HOOKS=1 ' + shlex.join(command)
    tmux('new-session', '-d', '-s', SESSION, '-x', '180', '-y', '48', '-c', str(FIXTURE), shell)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        text = screen()
        if 'trust this folder' in text or 'Yes, I trust' in text or 'accept the risk' in text or 'Yes, I accept' in text:
            tmux('send-keys', '-t', SESSION, 'Enter')
        if 'bypass permissions on' in text.lower() or '❯' in text:
            return
        time.sleep(1)
    raise RuntimeError('engine prompt unavailable')


def main():
    # A deterministic offer, drawn by a fixture plugin through the real UI engine.
    plugin = RUN / 'relay-fixture'
    (plugin / '.claude-plugin').mkdir(parents=True)
    (plugin / 'hooks').mkdir()
    (plugin / '.claude-plugin/plugin.json').write_text(json.dumps({'name': 'asks040-relay-fixture', 'version': '1.0.0'}))
    (plugin / 'hooks/hooks.json').write_text(json.dumps({'modules': ['./register.ts']}))
    (plugin / 'hooks/register.ts').write_text('''import type { Register } from 'claude-code'
export const register: Register = on => {
  let shown = false
  on('session.start', async ($, e, next) => { await $.command.register({ name: 'seed-heads-up', description: 'Draw the acceptance offer' }); return next(e) })
  on('command.run', { command: 'seed-heads-up' }, async ($) => { shown = true; $.ui.invalidate('ui.render'); return { text: 'Offer seeded' } })
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    if (!shown) return below
    const { Box, Text, Button } = $.ui.resolve(e)
    return Box({ flexDirection: 'column', children: [below, Box({ children: [Text({ children: 'Heads up · ASK040 relay acceptance card.' }), Button({ key: 'learn', label: 'Learn more', onPress: () => {} }), Button({ key: 'knew', label: 'Knew this already', onPress: () => {} })] })] })
  })
}
'''.replace('ASK040 relay acceptance card.', 'ASK040 relay acceptance card ' + SID + '.'))
    launch()
    for n in range(1, 6):
        marker = 'ASK040_TURN_' + str(n)
        send(f'Run Bash command `printf {marker}`. Then reply exactly DONE_{marker}.')
        wait(marker, lambda: answered('DONE_' + marker))
    baseline = rows()
    calls = [b for r in baseline for b in r.get('message', {}).get('content', []) if isinstance(b, dict) and b.get('type') == 'tool_use']
    returned = {b['tool_use_id'] for r in baseline for b in r.get('message', {}).get('content', []) if isinstance(b, dict) and b.get('type') == 'tool_result'}
    tools = sum(any(f'ASK040_TURN_{n}' in json.dumps(b.get('input', {})) and b.get('id') in returned for b in calls) for n in range(1, 6))
    full = sum('Native owner ask index' in json.dumps(r) for r in baseline)
    notices = sum(r.get('type') == 'system' and r.get('subtype') == 'informational' and any(name in json.dumps(r) for name in ['owner-asks', 'agent-should-know']) for r in baseline)
    check('a five owner turns', len(records()) == 5 and tools == 5 and len({r['uuid'] for r in records()}) == 5 and full == 0 and notices == 0,
          f'records={len(records())}, tool turns={tools}, full-index blocks={full}, mod notices={notices}')

    send('Run Bash command `sleep 12; printf ASK040_QUEUE_TOOL`. Then reply DONE_ASK040_QUEUE_TOOL.')
    wait('queue-tool', lambda: tool_started('ASK040_QUEUE_TOOL'))
    queued = 'ASK040 queued owner line one\nASK040 queued owner line two'
    # Bracketed paste preserves one composer message containing two lines.
    tmux('send-keys', '-t', SESSION, '-l', '\x1b[200~' + queued + '\x1b[201~')
    tmux('send-keys', '-t', SESSION, 'Enter')
    wait('queued-record', lambda: any('queued owner line one' in r['text'] for r in records()))
    row = next(r for r in records() if 'queued owner line one' in r['text'])
    check('b queued owner body', row['text'] == queued and row['door'] == 'delivery', f"door={row['door']}, text={row['text']!r}")
    wait('queue-answer', lambda: answered('DONE_ASK040_QUEUE_TOOL'))

    send('Run Bash command `sleep 12; printf ASK040_RELOAD_TOOL`. Then reply DONE_ASK040_RELOAD_TOOL.')
    wait('reload-tool', lambda: tool_started('ASK040_RELOAD_TOOL'))
    send('/reload-plugins')
    wait('reload-answer', lambda: answered('DONE_ASK040_RELOAD_TOOL'))
    send('Run Bash command `printf ASK040_AFTER_RELOAD`. Then reply DONE_ASK040_AFTER_RELOAD.')
    wait('reload-working', lambda: answered('DONE_ASK040_AFTER_RELOAD'))
    bad = sum(any(s in json.dumps(r) for s in ['CAS conflict', 'not saved', 'not-saved', 'integrity mismatch']) for r in rows())
    check('c reload mid-turn', bad == 0 and any('ASK040_AFTER_RELOAD' in r['text'] for r in records()), f'failure notices={bad}, capture continues={any("ASK040_AFTER_RELOAD" in r["text"] for r in records())}')

    before_compact = records()
    send('/compact')
    wait('compact', lambda: any(r.get('subtype') == 'compact_boundary' for r in rows()), 240)
    send('Run Bash command `printf ASK040_AFTER_COMPACT`. Then reply DONE_ASK040_AFTER_COMPACT.')
    wait('compact-answer', lambda: answered('DONE_ASK040_AFTER_COMPACT'))
    text = PROJECTION.read_text() if PROJECTION.exists() else ''
    compact_context = [r for r in rows() if r.get('type') == 'attachment' and r.get('attachment', {}).get('type') == 'hook_success' and '[agent-should-know] historical cache only;' in r.get('attachment', {}).get('content', '')]
    recalled = compact_context[0]['attachment']['content'] if len(compact_context) == 1 else ''
    check('d compaction projection', len(compact_context) == 1 and all(r['uuid'] in recalled and json.dumps(r['text'], ensure_ascii=False) in recalled for r in before_compact) and all(r['uuid'] in text and json.dumps(r['text'], ensure_ascii=False) in text for r in records()),
          f'projection appearances={len(compact_context)}, records in projection={len(records())}')

    before = len(records())
    send('/exit')
    wait('exit', lambda: subprocess.run(['tmux', 'has-session', '-t', SESSION], capture_output=True).returncode != 0)
    launch(True)
    send('Run Bash command `printf ASK040_AFTER_RESUME`. Then reply DONE_ASK040_AFTER_RESUME.')
    wait('resume-answer', lambda: answered('DONE_ASK040_AFTER_RESUME'))
    transcript = rows()
    reminder = sum('Owner message reminder after resume (owner-asks):' in json.dumps(r) and r.get('type') in ['user', 'attachment'] for r in transcript)
    check('e resume reminder', reminder == 1 and len(records()) > before, f'resume reminders={reminder}, records={before}->{len(records())}')

    send('/seed-heads-up')
    def handled():
        return any(' · handled ' in p.read_text() and 'ASK040 relay acceptance card' in p.read_text() for p in (Path.home() / '.local/state/agent-should-know').glob(f'{FIXTURE.name}/*-{SID[:8]}.log'))
    wait('relay-handled', handled)
    delivered = any('A side agent watching this session flagged this for you, the main agent:' in json.dumps(r) and 'ASK040 relay acceptance card' in json.dumps(r) for r in rows())
    clean = all('A side agent watching this session flagged' not in r['text'] for r in records())
    check('f relay handled', delivered and handled() and clean, f'card delivered={delivered}, handled log={handled()}, ask source excludes relay={clean}')
    send('/asks')
    send('/exit')


try:
    main()
except Exception as error:
    for name in ['a five owner turns', 'b queued owner body', 'c reload mid-turn', 'd compaction projection', 'e resume reminder', 'f relay handled'][len(results):]:
        check(name, False, f'{type(error).__name__}: {error}')
finally:
    # Stop only this throwaway test process. Evidence and session state stay on disk.
    subprocess.run(['tmux', 'kill-session', '-t', SESSION], capture_output=True)
    (RUN / 'result.json').write_text(json.dumps({'sid': SID, 'source': str(SOURCE), 'projection': str(PROJECTION), 'results': results}, indent=2))
    print('artifacts: ' + str(RUN), flush=True)
    code = 0 if len(results) == 6 and all(ok for ok, _ in results) else 1
    print('exit code: ' + str(code), flush=True)
    sys.exit(code)
