"""Real process checks; pass the authorized scratch directory as argv[1].

Run it outside the Claude Code sandbox: there killpg fails with EPERM, which looks exactly like
the macOS 27 race the spawn case guards (0.7.1). The spawn case runs 5 times, because that race
showed in 4 of 5 single runs on macOS 27 and never on Darwin 24."""
import json
import os
from pathlib import Path
import shlex
import signal
import subprocess
import sys
import tempfile
import time

runner = Path(__file__).resolve().parents[1] / 'scripts/cli.py'
with tempfile.TemporaryDirectory(dir=sys.argv[1]) as directory:
    root = Path(directory)
    profiles = root / '.config/agent-tmux/profiles'
    profiles.mkdir(parents=True)
    fake = root / 'fake.py'
    fake.write_text('import json,sys,time,os,subprocess,signal\n'
                    'from pathlib import Path\n'
                    'print(json.dumps(sys.argv[1:]), flush=True)\n'
                    'if sys.argv[-1] == "wait":\n'
                    ' Path("pid").write_text(str(os.getpid()))\n'
                    ' time.sleep(30)\n'
                    'if sys.argv[-1] == "spawn":\n'
                    ' child=subprocess.Popen([sys.executable,"-c","import time; time.sleep(30)"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)\n'
                    ' Path("descendant").write_text(str(child.pid))\n')
    with fake.open('a') as fixture:
        fixture.write('if sys.argv[-1] == "stubborn":\n'
                      ' signal.signal(signal.SIGTERM,signal.SIG_IGN)\n'
                      ' signal.signal(signal.SIGINT,signal.SIG_IGN)\n'
                      ' Path("pid").write_text(str(os.getpid()))\n'
                      ' time.sleep(30)\n')
    (profiles / 'test.conf').write_text(f'bin={sys.executable}\nheadless_flags={shlex.quote(str(fake))}\nheadless_prompt_flag=-p\n')
    env = {**os.environ, 'HOME': str(root)}
    argv = [sys.executable, str(runner), 'test', '10']
    ran = subprocess.run(argv, input='$(touch never); literal', text=True, capture_output=True, env=env, cwd=root)
    assert ran.returncode == 0, ran.stderr
    assert json.loads(ran.stdout) == ['-p', '$(touch never); literal']
    assert not (root / 'never').exists()
    print('PASS headless_flags and literal prompt; no shell expansion')
    for attempt in range(5):
        ran = subprocess.run(argv, input='spawn', text=True, capture_output=True, env=env, cwd=root)
        assert ran.returncode == 0, ran.stderr
        pid = int((root / 'descendant').read_text())
        until = time.monotonic() + 5
        while time.monotonic() < until:
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
            time.sleep(0.02)
        else:
            os.kill(pid, signal.SIGKILL)
            raise AssertionError(f'normal exit left descendant {pid} alive')
    print(f'PASS normal exit reaps background descendant, 5 runs (last {pid})')
    for mode in ['abort', 'timeout']:
        child = subprocess.Popen([*argv[:-1], '0.3' if mode == 'timeout' else '10'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env, cwd=root)
        child.stdin.write('wait')
        child.stdin.close()
        until = time.monotonic() + 5
        while not (root / 'pid').exists() and time.monotonic() < until:
            time.sleep(0.02)
        pid = int((root / 'pid').read_text())
        if mode == 'abort':
            child.send_signal(signal.SIGTERM)
        assert child.wait(timeout=8) != 0
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            pass
        else:
            raise AssertionError(f'{mode} left CLI {pid} alive')
        (root / 'pid').unlink()
        print(f'PASS {mode} stops CLI process {pid}')
    child = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env, cwd=root)
    child.stdin.write('stubborn')
    child.stdin.close()
    try:
        until = time.monotonic() + 5
        while not (root / 'pid').exists() and time.monotonic() < until:
            time.sleep(0.02)
        pid = int((root / 'pid').read_text())
        child.send_signal(signal.SIGTERM)
        time.sleep(0.1)
        child.send_signal(signal.SIGINT)
        assert child.wait(timeout=8) == 128 + signal.SIGTERM, 'second signal re-entered cleanup'
        try:
            os.kill(pid, 0)
        except ProcessLookupError:
            pass
        else:
            raise AssertionError(f'repeated signals left child {pid} alive')
        print(f'PASS repeated SIGTERM/SIGINT cannot re-enter cleanup; exit=143; child {pid} absent')
    finally:
        if child.poll() is None:
            child.kill()
            child.wait(timeout=5)
        if (root / 'pid').exists():
            try:
                os.kill(int((root / 'pid').read_text()), signal.SIGKILL)
            except ProcessLookupError:
                pass
            (root / 'pid').unlink()
    stop = root / 'stop.sh'
    stop.write_text('print -r -- "$* $TMUX_AGENT_DIR" > ' + shlex.quote(str(root / 'stopped')) + '\nprint -r -- "Stopped test-$3"\n')
    for state in ['armed', 'keep']:
        marker = root / ('guard-' + state)
        marker.write_text(state)
        guard = subprocess.Popen([sys.executable, str(runner), '--guard', str(stop), 'test', 'worker', str(marker), str(root)], stdout=subprocess.PIPE, text=True)
        assert guard.stdout.readline().strip() == 'ready'
        if state == 'armed':
            guard.kill()
            assert guard.wait(timeout=5) == -signal.SIGKILL
        else:
            guard.terminate()
            assert guard.wait(timeout=5) == 0
        result = Path(str(marker) + '.cleanup.json')
        until = time.monotonic() + 5
        while state == 'armed' and not result.exists() and time.monotonic() < until:
            time.sleep(0.02)
        if state == 'armed':
            assert json.loads(result.read_text())['exitCode'] == 0
            assert json.loads(result.read_text())['stopped'] is True
            assert (root / 'stopped').read_text().strip() == 'test stop worker ' + str(root)
        else:
            assert not result.exists()
        print('PASS worker cleanup guard ' + state)
    marker = root / 'selector'
    marker.write_text('armed')
    for name, owner in [('owned.12345', 'session'), ('owned.67890', 'foreign')]:
        worker_dir = root / name
        worker_dir.mkdir()
        (worker_dir / 'worker.json').write_text(json.dumps({'name': name, 'owner': owner}))
        (worker_dir / 'pane-id').write_text('%1')
    selector = json.dumps({'prefix': 'owned.', 'owner': 'session'})
    guard = subprocess.Popen([sys.executable, str(runner), '--guard', str(stop), 'test', selector, str(marker), str(root)], stdout=subprocess.PIPE, text=True)
    assert guard.stdout.readline().strip() == 'ready'
    guard.kill()
    guard.wait(timeout=5)
    result = Path(str(marker) + '.cleanup.json')
    until = time.monotonic() + 5
    while not result.exists() and time.monotonic() < until:
        time.sleep(0.02)
    rows = json.loads(result.read_text())['workers']
    assert len(rows) == 1 and rows[0]['worker'] == 'owned.12345' and rows[0]['stopped'] is True
    print('PASS pre-assign guard recovers owned receipt; foreign worker untouched')
    # A selector cleanup that runs before assign reserves its worker must wait for it, not finish empty.
    marker = root / 'late-selector'
    marker.write_text('armed')
    guard = subprocess.Popen([sys.executable, str(runner), '--guard', str(stop), 'test', json.dumps({'prefix': 'late.', 'owner': 'session'}), str(marker), str(root)], stdout=subprocess.PIPE, text=True)
    assert guard.stdout.readline().strip() == 'ready'
    guard.kill()
    guard.wait(timeout=5)
    result = Path(str(marker) + '.cleanup.json')
    time.sleep(1.5)
    assert not result.exists(), 'selector cleanup finished before the worker was reserved'
    late = root / 'late.1'
    late.mkdir()
    (late / 'worker.json').write_text(json.dumps({'name': 'late.1', 'owner': 'session'}))
    (late / 'pane-id').write_text('%1')
    until = time.monotonic() + 5
    while not result.exists() and time.monotonic() < until:
        time.sleep(0.02)
    rows = json.loads(result.read_text())['workers']
    assert len(rows) == 1 and rows[0]['worker'] == 'late.1' and rows[0]['stopped'] is True, rows
    print('PASS selector cleanup waits for a worker reserved after abort, then stops it')
    delayed = root / 'delayed'
    delayed.mkdir()
    (delayed / 'worker.json').write_text(json.dumps({'name': 'delayed', 'owner': 'session'}))
    marker = root / 'delayed-guard'
    marker.write_text('armed')
    guard = subprocess.Popen([sys.executable, str(runner), '--guard', str(stop), 'test', 'delayed', str(marker), str(root)], stdout=subprocess.PIPE, text=True)
    assert guard.stdout.readline().strip() == 'ready'
    guard.kill()
    guard.wait(timeout=5)
    result = Path(str(marker) + '.cleanup.json')
    time.sleep(0.2)
    assert not result.exists() and marker.read_text() == 'armed', 'stop ran before the log-less detached start'
    (delayed / 'mod-assign.log').write_text('launch now starts')
    (delayed / 'pane-id').write_text('%1')
    until = time.monotonic() + 5
    while not result.exists() and time.monotonic() < until:
        time.sleep(0.02)
    assert json.loads(result.read_text())['stopped'] is True
    print('PASS worker.json without log waits for delayed launch, then stops worker')
    pending = root / 'pending'
    pending.mkdir()
    (pending / 'worker.json').write_text(json.dumps({'name': 'pending', 'owner': 'session'}))
    marker = root / 'pending-guard'
    marker.write_text('armed')
    watcher = root / 'short-watch.py'
    watcher.write_text('import importlib.util\n'
                       f'spec=importlib.util.spec_from_file_location("cli", {str(runner)!r})\n'
                       'cli=importlib.util.module_from_spec(spec)\n'
                       'spec.loader.exec_module(cli)\n'
                       'cli.LAUNCH_WAIT_SECONDS=0.15\n'
                       'cli.LAUNCH_ABANDON_SECONDS=0.15\n'
                       'cli.watch()\n')
    (root / 'stopped').unlink()
    guard = subprocess.Popen([sys.executable, str(watcher), '--watch', str(stop), 'test', 'pending', str(marker), str(root)], stdin=subprocess.DEVNULL)
    try:
        result = Path(str(marker) + '.cleanup.json')
        until = time.monotonic() + 5
        while not result.exists() and time.monotonic() < until:
            time.sleep(0.02)
        body = json.loads(result.read_text())
        assert body['ev'] == 'cli-launch-wait-timeout' and body['stopped'] is False
        assert marker.read_text() == 'armed' and guard.poll() is None and not (root / 'stopped').exists()
        (pending / 'launch.exit').write_text('1')
        assert guard.wait(timeout=5) == 0
        assert json.loads(result.read_text())['stopped'] is True and marker.read_text() == 'keep'
        print('PASS launch wait timeout logs cli-launch-wait-timeout, keeps live guard armed, then retries after launch.exit')
    finally:
        marker.write_text('keep')
        if guard.poll() is None:
            guard.terminate()
            guard.wait(timeout=5)
    rejected = root / 'rejected.12345'
    rejected.mkdir()
    (rejected / 'worker.json').write_text(json.dumps({'name': rejected.name, 'owner': 'session'}))
    marker = root / 'rejected-guard'
    marker.write_text('armed')
    (root / 'stopped').unlink()
    selector = json.dumps({'prefix': 'rejected.', 'owner': 'session'})
    guard = subprocess.Popen([sys.executable, str(runner), '--guard', str(stop), 'test', selector, str(marker), str(root)], stdout=subprocess.PIPE, text=True)
    assert guard.stdout.readline().strip() == 'ready'
    marker.write_text('no-launch')
    started = time.monotonic()
    guard.terminate()
    assert guard.wait(timeout=5) == 0
    result = Path(str(marker) + '.cleanup.json')
    until = time.monotonic() + 2
    while not result.exists() and time.monotonic() < until:
        time.sleep(0.02)
    body = json.loads(result.read_text())
    assert body['ev'] == 'cli-no-launch' and body['workers'][0]['worker'] == rejected.name
    assert body['workers'][0]['finished'] and not (root / 'stopped').exists()
    assert time.monotonic() - started < 2
    print('PASS rejected assign after reservation exits immediately and logs cli-no-launch worker=rejected.12345')
    abandoned = root / 'abandoned'
    abandoned.mkdir()
    reservation = abandoned / 'worker.json'
    reservation.write_text(json.dumps({'name': 'abandoned', 'owner': 'gone'}))
    future = time.time() + 1000
    os.utime(reservation, (future, future))
    marker = root / 'abandoned-guard'
    marker.write_text(json.dumps({'state': 'armed', 'owner': {'sessionId': 'gone', 'pid': 999999999, 'procStart': 'gone'}}))
    guard = subprocess.Popen([sys.executable, str(watcher), '--watch', str(stop), 'test', 'abandoned', str(marker), str(root)], stdin=subprocess.DEVNULL, env=env)
    try:
        result = Path(str(marker) + '.cleanup.json')
        time.sleep(0.25)
        assert guard.poll() is None and not (root / 'stopped').exists()
        proc_start = subprocess.run(['ps', '-p', str(os.getpid()), '-o', 'lstart='], capture_output=True, text=True,
                                    env={**os.environ, 'TZ': 'UTC', 'LC_ALL': 'C'}, check=True).stdout.strip()
        live_owner = {'sessionId': 'fixture-live', 'pid': os.getpid(), 'procStart': proc_start}
        registry = root / '.claude/sessions' / f'{os.getpid()}.json'
        registry.parent.mkdir(parents=True)
        registry.write_text(json.dumps(live_owner))
        marker.write_text(json.dumps({'state': 'armed', 'owner': live_owner}))
        # Advance reservation age past the injected bound without waiting ten minutes.
        past = time.time() - 1
        os.utime(reservation, (past, past))
        time.sleep(0.3)
        assert guard.poll() is None and not (root / 'stopped').exists()
        print('PASS aged reservation with live owner stays guarded')
        registry.unlink()
        assert guard.wait(timeout=5) == 0
        body = json.loads(result.read_text())
        assert body['ev'] == 'cli-launch-abandoned' and body['worker'] == 'abandoned' and body['finished']
        assert not (root / 'stopped').exists()
        print('PASS dead owner plus aged log-less reservation logs cli-launch-abandoned worker=abandoned and exits')
    finally:
        marker.write_text('keep')
        if guard.poll() is None:
            guard.terminate()
            guard.wait(timeout=5)
    marker = root / 'failed-stop'
    marker.write_text('armed')
    stop.write_text('print -r -- "stop failed"\nexit 1\n')
    guard = subprocess.Popen([sys.executable, str(runner), '--guard', str(stop), 'test', 'worker', str(marker), str(root)], stdout=subprocess.PIPE, text=True)
    assert guard.stdout.readline().strip() == 'ready'
    guard.kill()
    guard.wait(timeout=5)
    result = Path(str(marker) + '.cleanup.json')
    until = time.monotonic() + 5
    while not result.exists() and time.monotonic() < until:
        time.sleep(0.02)
    failed = json.loads(result.read_text())
    assert failed['stopped'] is False and marker.read_text() == 'armed'
    os.kill(failed['guardPid'], 0)
    marker.write_text('keep')
    until = time.monotonic() + 5
    while time.monotonic() < until:
        try:
            os.kill(failed['guardPid'], 0)
        except ProcessLookupError:
            break
        time.sleep(0.02)
    else:
        os.kill(failed['guardPid'], signal.SIGKILL)
        raise AssertionError('failed-stop guard did not release after keep')
    print('PASS failed detached stop retains armed marker and live guard')
    # A guard whose watcher died has no cleanup path left; it must exit instead of sleeping forever.
    marker = root / 'orphan-guard'
    marker.write_text('armed')
    guard = subprocess.Popen([sys.executable, str(runner), '--guard', str(stop), 'test', 'orphan', str(marker), str(root)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        assert guard.stdout.readline().strip() == 'ready'
        watchers = subprocess.run(['pgrep', '-f', '--', '--watch .* ' + str(marker) + ' '], capture_output=True, text=True).stdout.split()
        assert len(watchers) == 1, watchers
        os.kill(int(watchers[0]), signal.SIGKILL)
        assert guard.wait(timeout=5) == 1
        assert 'exited before cleanup' in guard.stderr.read()
    finally:
        if guard.poll() is None:
            guard.kill()
            guard.wait(timeout=5)
    print('PASS guard exits 1 once its watcher is gone before cleanup')
    # A marker read mid-write must not kill the watcher: it is the only cleanup path.
    marker = root / 'torn-marker'
    marker.write_text('armed')
    guard = subprocess.Popen([sys.executable, str(runner), '--guard', str(stop), 'test', 'torn', str(marker), str(root)], stdout=subprocess.PIPE, text=True)
    try:
        assert guard.stdout.readline().strip() == 'ready'
        watchers = subprocess.run(['pgrep', '-f', '--', '--watch .* ' + str(marker) + ' '], capture_output=True, text=True).stdout.split()
        assert len(watchers) == 1, watchers
        marker.write_text('{"own')
        guard.kill()  # the watcher acts only after its guard's pipe closes
        guard.wait(timeout=5)
        time.sleep(1.5)
        os.kill(int(watchers[0]), 0)
        marker.write_text('keep')
        until = time.monotonic() + 5
        while time.monotonic() < until:
            try:
                os.kill(int(watchers[0]), 0)
            except ProcessLookupError:
                break
            time.sleep(0.05)
        else:
            raise AssertionError('watcher ignored keep after a torn marker')
    finally:
        if guard.poll() is None:
            guard.kill()
            guard.wait(timeout=5)
        marker.write_text('keep')
    print('PASS watcher survives a torn marker and exits on keep')
    stop.write_text('sleep 0.8\nprint -r -- "Stopped test-$3"\n')
    jobs = [{'binary': str(stop), 'profile': 'test', 'worker': name, 'marker': str(root / name), 'ledger': str(root)} for name in ['first', 'second']]
    result = root / 'batch.json'
    started = time.monotonic()
    ran = subprocess.run([sys.executable, str(runner), '--batch', json.dumps(jobs), str(result)], capture_output=True, text=True, timeout=2)
    assert ran.returncode == 0 and ran.stdout.strip() == 'ready'
    assert time.monotonic() - started < 0.6, 'handoff waited for worker stops'
    until = time.monotonic() + 5
    while not result.exists() and time.monotonic() < until:
        time.sleep(0.02)
    body = json.loads(result.read_text())
    assert len(body['workers']) == 2 and all(row['stopped'] for row in body['workers']) and body['ms'] < 1500, body
    print(f'PASS detached batch stops two workers in parallel: {body["ms"]}ms')
