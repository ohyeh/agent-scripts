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
import argparse
import shutil

print('WARNING: Throwaway sessions run with permissions skipped and can run any command on this host.', file=sys.stderr)

REPO = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--asks-plugin', type=Path, default=REPO / 'mods/owner-asks', help='Ask mod directory to test, including a historical extracted mod')
parser.add_argument('--asks-ref', help='Read the owner-asks source at this local git ref into a disposable fixture')
parser.add_argument('--regressions', action='store_true', help='Run the four real-incident probes in separate throwaway sessions')
parser.add_argument('--episode5', choices=['paste', 'capture', 'relay'], help='Run one lifecycle acceptance probe')
args = parser.parse_args()
ASKS_PLUGIN = args.asks_plugin.resolve()
ASKS_NAME = json.loads((ASKS_PLUGIN / '.claude-plugin/plugin.json').read_text())['name']
RUN = REPO / '.workflow' / (time.strftime('%Y%m%d%H%M%S') + '-asks040-engine')
RUN.mkdir(parents=True)
if args.regressions:
    # Probe source replacement on a disposable copy, never the checkout or installed plugin.
    shutil.copytree(ASKS_PLUGIN, RUN / 'asks-target', symlinks=True)
    ASKS_PLUGIN = RUN / 'asks-target'
if args.asks_ref:
    target = RUN / 'asks-ref'
    shutil.copytree(ASKS_PLUGIN, target)
    for path in ['hooks/register.ts', 'hooks/lib/asks.ts']:
        (target / path).write_bytes(subprocess.check_output(['git', '-C', str(REPO), 'show', args.asks_ref + ':mods/owner-asks/' + path]))
    ASKS_PLUGIN = target
FIXTURE = RUN / 'fixture'
FIXTURE.mkdir()
SID = str(uuid.uuid4())
SESSION = 'asks040-' + SID[:8]
ROOT = Path.home() / '.local/state' / ASKS_NAME / SID
SOURCE = ROOT / 'owner.asks.jsonl'
PROJECTION = Path.home() / '.local/state/agent-hooks' / SID / 'asks-open.md'
TRANSCRIPT = Path.home() / '.claude/projects' / str(FIXTURE).replace('/', '-').replace('.', '-') / (SID + '.jsonl')
results = []
submissions = []


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


def composer(capture):
    draft = next((line[1:].strip() for line in reversed(capture.splitlines()) if line.startswith('❯')), None)
    # The empty editor can show a dim suggestion; fixture prompts never start this way.
    return '' if draft is not None and draft.startswith('Try "') else draft


def send(text, paste=False, pasted=None):
    # Printed evidence also satisfies the user's normal completion hook.
    text = text.replace('printf ASK040_', "printf 'exit 0\\n'; printf ASK040_")
    wait('composer-ready', lambda: composer(screen()) == '', 60)
    before = {r.get('uuid') for r in rows()}
    literal = '\x1b[200~' + text + '\x1b[201~' if paste else text
    if pasted is not None:
        literal = text.replace(pasted, '\x1b[200~' + pasted + '\x1b[201~', 1)
    tmux('send-keys', '-t', SESSION, '-l', literal)
    wait('draft-rendered', lambda: bool(composer(screen())), 60)
    tmux('send-keys', '-t', SESSION, 'Enter')
    attempt = {'text': text, 'enters': 1, 'confirmed_by': None}
    last_enter = time.monotonic()

    def accepted():
        nonlocal last_enter
        if text == '/exit' and subprocess.run(['tmux', 'has-session', '-t', SESSION], capture_output=True).returncode != 0:
            attempt['confirmed_by'] = 'session-exited'
            return True
        needle = json.dumps(text, ensure_ascii=False)[1:-1]
        if any(r.get('uuid') not in before and r.get('type') in ['user', 'attachment'] and needle in json.dumps(r, ensure_ascii=False) for r in rows()):
            attempt['confirmed_by'] = 'transcript'
            return True
        draft = composer(screen())
        if draft == '':
            attempt['confirmed_by'] = 'composer-cleared'
            return True
        # Recheck the visible pending draft before retrying an Enter the TUI ignored.
        if draft and time.monotonic() - last_enter >= 1:
            tmux('send-keys', '-t', SESSION, 'Enter')
            attempt['enters'] += 1
            last_enter = time.monotonic()
        return False

    wait('submission-confirmed', accepted, 60)
    submissions.append(attempt)


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
    command = ['claude', '--plugin-dir', str(ASKS_PLUGIN)]
    if ASKS_NAME != 'agent-should-know':
        command += ['--plugin-dir', str(REPO / 'mods/agent-should-know')]
    else:
        # The old combined mod occupies both slots; shadow the installed new slot for this session only.
        command += ['--plugin-dir', str(RUN / 'owner-asks-slot')]
    command += ['--plugin-dir', str(RUN / 'relay-fixture'),
               '--dangerously-skip-permissions', '--debug-file', str(RUN / ('resume.debug' if resume else 'engine.debug')),
               '--append-system-prompt', 'Acceptance fixture. Follow only the supplied test prompt. Never read owner files, change plugins, delegate, push, or install. Use Bash only for the exact harmless printf/sleep command requested. Reply with the requested marker.']
    command += ['--resume' if resume else '--session-id', SID]
    # Clean inside the pane: a persistent tmux server can retain the caller's environment.
    bootstrap = '''import os, sys
for name in list(os.environ):
    if name == 'CLAUDECODE' or name == 'CLAUDE_PID' or name.startswith('CLAUDE_CODE_'):
        del os.environ[name]
os.environ['CLAUDE_CODE_ENABLE_FUNCTION_HOOKS'] = '1'
os.execvp(sys.argv[1], sys.argv[1:])
'''
    shell = shlex.join([sys.executable, '-c', bootstrap, *command])
    tmux('new-session', '-d', '-s', SESSION, '-x', '180', '-y', '48', '-c', str(FIXTURE), shell)
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        text = screen()
        if 'trust this folder' in text or 'Yes, I trust' in text or 'accept the risk' in text or 'Yes, I accept' in text:
            tmux('send-keys', '-t', SESSION, 'Enter')
        if 'bypass permissions on' in text.lower() and composer(text) == '':
            return
        time.sleep(1)
    (RUN / 'timeout-startup.txt').write_text(screen())
    raise RuntimeError('engine prompt unavailable')


def offer_fixture():
    if ASKS_NAME == 'agent-should-know':
        slot = RUN / 'owner-asks-slot/.claude-plugin'
        slot.mkdir(parents=True)
        (slot / 'plugin.json').write_text(json.dumps({'name': 'owner-asks', 'version': '0.0.0', 'description': 'Empty session-only slot while testing the historical combined mod'}))
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


def main():
    offer_fixture()
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
    send(queued, paste=True)
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


def incident_probes():
    offer_fixture()
    global SID, SESSION, ROOT, SOURCE, PROJECTION, TRANSCRIPT
    cases = ['diagnostics', 'queued-body', 'resume-write', 'pending-reload']
    observations = []
    for case in cases:
        SID = str(uuid.uuid4())
        SESSION = 'asks040-' + SID[:8]
        ROOT = Path.home() / '.local/state' / ASKS_NAME / SID
        SOURCE = ROOT / 'owner.asks.jsonl'
        PROJECTION = Path.home() / '.local/state/agent-hooks' / SID / 'asks-open.md'
        TRANSCRIPT = Path.home() / '.claude/projects' / str(FIXTURE).replace('/', '-').replace('.', '-') / (SID + '.jsonl')
        detail = {'case': case, 'sid': SID, 'source': str(SOURCE)}
        try:
            if case == 'diagnostics':
                ROOT.mkdir(parents=True)
                (ROOT / 'diagnostics.jsonl').write_text('{"event":"seed"}\n' * 70000)
            launch()
            if case == 'diagnostics':
                send('Run Bash command `printf ASK040_DIAGNOSTICS`. Then reply DONE_ASK040_DIAGNOSTICS.')
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    warnings = [r for r in rows() if r.get('type') == 'system' and 'diagnostics size warning' in str(r.get('content', ''))]
                    if len(warnings) >= 3 or answered('DONE_ASK040_DIAGNOSTICS'):
                        break
                    time.sleep(.5)
                detail.update(size_warnings=len(warnings), answered=answered('DONE_ASK040_DIAGNOSTICS'))
                check('regression diagnostics', detail['answered'] and len(warnings) < 3, f"seed bytes={(ROOT / 'diagnostics.jsonl').stat().st_size}, size-warning notices={len(warnings)}, answered={detail['answered']}")
            elif case == 'queued-body':
                send('Run Bash command `sleep 12; printf ASK040_INCIDENT_TOOL`. Then reply DONE_ASK040_INCIDENT_TOOL.')
                wait('incident-tool', lambda: tool_started('ASK040_INCIDENT_TOOL'))
                body = 'ASK040 incident owner line one\nASK040 incident owner line two'
                send(body, paste=True)
                wait('incident-owner-record', lambda: any('ASK040 incident owner line one' in r['text'] for r in records()))
                row = next(r for r in records() if 'ASK040 incident owner line one' in r['text'])
                polluted = '<system-reminder>' in row['text'] or any('<system-reminder>' in i['text'] for i in row.get('items', []))
                detail.update(wrapper_in_owner_ask=polluted, owner_uuid=row['uuid'])
                check('regression queued-body', row['text'] == body and not polluted, f'wrapper in owner ask={polluted}, uuid={row["uuid"]}')
            else:
                marker = 'ASK040_' + case.replace('-', '_').upper()
                send(f'Run Bash command `printf {marker}`. Then reply DONE_{marker}.')
                wait('incident-baseline', lambda: answered('DONE_' + marker) and len(records()) > 0)
                before = len(records())
                if case == 'resume-write':
                    send('/exit')
                    wait('incident-exit', lambda: subprocess.run(['tmux', 'has-session', '-t', SESSION], capture_output=True).returncode != 0)
                    launch(True)
                else:
                    if ASKS_NAME == 'agent-should-know':
                        def pending():
                            return any(not p.with_name(p.name.replace('.evidence.json', '.json')).exists() for p in (ROOT / 'audit').glob('*.evidence.json'))
                        wait('audit-pending', pending, 30)
                        detail['audit_pending_observed'] = True
                    source = ASKS_PLUGIN / 'hooks/register.ts'
                    detail['reload_trigger'] = 'Append a comment to the disposable copy; runtime logic is unchanged'
                    with source.open('a') as output:
                        output.write('\n// Acceptance fixture: trigger source replacement while work is pending.\n')
                    send('/reload-plugins')
                after_marker = marker + '_AFTER'
                send(f'Run Bash command `printf {after_marker}`. Then reply DONE_{after_marker}.')
                wait('incident-after', lambda: answered('DONE_' + after_marker), 45)
                send('/asks')
                wait('asks-status', lambda: any(t in screen() for t in [': off;', ': on;', 'records:']), 15)
                capture = screen()
                off = ': off;' in capture or 'UNKNOWN interrupted audit at reload' in capture or 'explicit on required' in capture
                after = len(records())
                evidence = [str(r.get('content', '')) for r in rows() if r.get('type') == 'system' and any(t in str(r.get('content', '')) for t in ['integrity mismatch', 'interrupted audit', 'CAS conflict', 'explicit on required'])]
                detail.update(before=before, after=after, off=off, notices=evidence)
                check('regression ' + case, after > before and not off, f'ledger records={before}->{after}, off={off}, notices={json.dumps(evidence, ensure_ascii=False)}')
        except Exception as error:
            detail['unconfirmed'] = str(error)
            check('regression ' + case, False, f'UNCONFIRMED scenario: {type(error).__name__}: {error}')
        finally:
            try:
                (RUN / (case + '-screen.txt')).write_text(screen())
            except subprocess.CalledProcessError:
                pass
            (RUN / (case + '-transcript.json')).write_text(json.dumps(rows(), ensure_ascii=False))
            subprocess.run(['tmux', 'kill-session', '-t', SESSION], capture_output=True)
            observations.append(detail)
    (RUN / 'incidents.json').write_text(json.dumps(observations, ensure_ascii=False, indent=2))


def episode5_probe():
    offer_fixture()
    launch()
    if args.episode5 == 'paste':
        body = 'PASTE_NOT_OWNER_' + 'x' * 2130
        raw = 'Owner before ' + body + ' Owner after. Reply exactly PASTE_DONE.'
        send(raw, pasted=body)
        wait('paste-answer', lambda: answered('PASTE_DONE') and bool(records()))
        send('/compact')
        wait('paste-compact', lambda: any(r.get('subtype') == 'compact_boundary' for r in rows()), 240)
        send('Run Bash command `printf ASK040_PASTE_AFTER`. Then reply DONE_ASK040_PASTE_AFTER.')
        wait('paste-after', lambda: answered('DONE_ASK040_PASTE_AFTER'))
        row = records()[0]
        projection = PROJECTION.read_text()
        check('episode5 paste', 'Owner before' in row['text'] and 'Owner after' in row['text'] and '[pasted ' in row['text'] and body not in row['text'] and body not in projection,
              f'owner chars={len(row["text"])}, paste leaked={body in row["text"]}, projection leaked={body in projection}')
    send('/exit')


try:
    if args.episode5:
        episode5_probe()
    elif args.regressions:
        incident_probes()
    else:
        main()
except Exception as error:
    for name in ['a five owner turns', 'b queued owner body', 'c reload mid-turn', 'd compaction projection', 'e resume reminder', 'f relay handled'][len(results):]:
        check(name, False, f'{type(error).__name__}: {error}')
finally:
    # Stop only this throwaway test process. Evidence and session state stay on disk.
    subprocess.run(['tmux', 'kill-session', '-t', SESSION], capture_output=True)
    (RUN / 'result.json').write_text(json.dumps({'sid': SID, 'source': str(SOURCE), 'projection': str(PROJECTION), 'submissions': submissions, 'results': results}, indent=2))
    print('artifacts: ' + str(RUN), flush=True)
    code = 0 if len(results) == (1 if args.episode5 else 4 if args.regressions else 6) and all(ok for ok, _ in results) else 1
    print('exit code: ' + str(code), flush=True)
    sys.exit(code)
