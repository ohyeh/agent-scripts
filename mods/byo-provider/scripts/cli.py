"""Run the owner's headless profile without a shell or environment changes."""
import os
import json
from pathlib import Path
import shlex
import signal
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

LAUNCH_WAIT_SECONDS = 30
# Pre-launch normally takes seconds; allow ten minutes before judging a dead owner's reservation.
LAUNCH_ABANDON_SECONDS = 600
EMPTY_SINCE = None


def guard():
    binary, profile, worker, marker, ledger = sys.argv[2:]
    # Reparent before ready: engine cancellation also kills descendants, even in another session.
    reader, writer = os.pipe()
    pid_reader, pid_writer = os.pipe()
    launcher = os.fork()
    if launcher == 0:
        os.setsid()
        watcher = os.fork()
        if watcher != 0:
            os.write(pid_writer, str(watcher).encode())
            os._exit(0)
        os.close(pid_reader)
        os.close(pid_writer)
        os.close(writer)
        os.dup2(reader, 0)
        os.close(reader)
        null = os.open(os.devnull, os.O_RDWR)
        os.dup2(null, 1)
        os.dup2(null, 2)
        os.close(null)
        os.execv(sys.executable, [sys.executable, __file__, '--watch', binary, profile, worker, marker, ledger])
    os.close(reader)
    os.close(pid_writer)
    os.waitpid(launcher, 0)
    watcher = int(os.read(pid_reader, 32))
    os.close(pid_reader)
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    signal.signal(signal.SIGINT, lambda *_: sys.exit(0))
    print('ready', flush=True)
    # The watcher is the only cleanup path; once it is gone the guard has no job left.
    while True:
        try:
            os.kill(watcher, 0)
        except ProcessLookupError:
            break
        time.sleep(1)
    marker_state = Path(marker).read_text() if Path(marker).exists() else 'missing'
    if marker_state != 'keep' and not Path(marker + '.cleanup.json').exists():
        raise RuntimeError(f'watcher {watcher} exited before cleanup; marker={marker_state[:40]}')


def stop_worker(binary, profile, worker, marker, ledger):
    try:
        state = Path(ledger) / worker
        if Path(marker).exists() and Path(marker).read_text() == 'no-launch':
            return {'worker': worker, 'stopped': False, 'finished': True, 'ev': 'cli-no-launch'}
        # Reservation precedes both the log and detached start; absence of a log proves nothing.
        if (state / 'worker.json').exists() or (state / 'mod-assign.log').exists():
            until = time.monotonic() + LAUNCH_WAIT_SECONDS
            while not (state / 'pane-id').exists() and not (state / 'launch.exit').exists():
                raw = Path(marker).read_text() if Path(marker).exists() else 'armed'
                if raw == 'no-launch':
                    return {'worker': worker, 'stopped': False, 'finished': True, 'ev': 'cli-no-launch'}
                reservation = state / 'worker.json'
                if reservation.exists() and not (state / 'mod-assign.log').exists() and time.time() - reservation.stat().st_mtime >= LAUNCH_ABANDON_SECONDS:
                    owner = json.loads(raw).get('owner') if raw.startswith('{') else None
                    if owner and not owner_alive(owner):
                        return {'worker': worker, 'stopped': False, 'finished': True, 'ev': 'cli-launch-abandoned'}
                if time.monotonic() >= until:
                    raise TimeoutError(f'CLI launch pending after {LAUNCH_WAIT_SECONDS:g}s; guard remains armed')
                time.sleep(0.05)
        ran = subprocess.run(['zsh', binary, profile, 'stop', worker], capture_output=True, text=True,
                             env={**os.environ, 'TMUX_AGENT_DIR': ledger}, timeout=660)
        confirmed = ran.returncode == 0 and any(
            line.startswith(('Stopped ', 'Already stopped: ')) and line.endswith('-' + worker)
            for line in ran.stdout.splitlines())
        result = {'worker': worker, 'exitCode': ran.returncode, 'stopped': confirmed,
                  'receipt': ran.stdout[-300:], 'error': ran.stderr[-300:]}
    except Exception as error:
        result = {'worker': worker, 'exitCode': -1, 'stopped': False, 'error': str(error),
                  'ev': 'cli-launch-wait-timeout' if isinstance(error, TimeoutError) else 'cli-stop-fail'}
    if result['stopped']:
        Path(marker).write_text('keep')
    return result


def cleanup():
    binary, profile, worker, marker, ledger = sys.argv[2:]
    if worker.startswith('{'):
        selector = json.loads(worker)
        workers = []
        global EMPTY_SINCE
        for path in Path(ledger).glob('*/worker.json'):
            if not path.parent.name.startswith(selector['prefix']):
                continue
            row = json.loads(path.read_text())
            if row.get('owner') == selector['owner'] and row.get('name', '').startswith(selector['prefix']):
                workers.append(row['name'])
        if not workers and Path(marker).read_text() != 'no-launch':
            # An assign cut short may reserve its worker later; wait as the single-worker path does.
            EMPTY_SINCE = EMPTY_SINCE or time.monotonic()
            if time.monotonic() - EMPTY_SINCE < LAUNCH_WAIT_SECONDS:
                return False
        with ThreadPoolExecutor(max_workers=max(1, len(workers))) as pool:
            results = list(pool.map(lambda name: stop_worker(binary, profile, name, marker, ledger), workers))
        result = {'workers': results}
    else:
        result = stop_worker(binary, profile, worker, marker, ledger)
    if Path(marker).read_text() == 'no-launch':
        result['ev'] = 'cli-no-launch'
    result['guardPid'] = os.getpid()
    Path(marker + '.cleanup.json').write_text(json.dumps(result))
    return all(row.get('finished') or row['stopped'] for row in result['workers']) if 'workers' in result else result.get('finished') or result['stopped']


def owner_alive(owner):
    try:
        row = json.loads((Path.home() / '.claude/sessions' / (str(owner['pid']) + '.json')).read_text())
        if any(row.get(key) != owner[key] for key in ('pid', 'sessionId', 'procStart')):
            return False
        ran = subprocess.run(['ps', '-p', str(owner['pid']), '-o', 'lstart='], capture_output=True,
                             text=True, env={**os.environ, 'TZ': 'UTC', 'LC_ALL': 'C'}, timeout=5)
        return ran.returncode != 1 and (ran.returncode != 0 or ' '.join(ran.stdout.split()) == ' '.join(owner['procStart'].split()))
    except FileNotFoundError:
        return False
    except Exception:
        return True


def watch():
    sys.stdin.read()
    while True:
        try:
            state = Path(sys.argv[-2]).read_text()
            if state == 'keep':
                return
            metadata = json.loads(state) if state.startswith('{') else {}
            if state in ('armed', 'no-launch') or metadata.get('state') == 'armed' or not owner_alive(metadata['owner']):
                if cleanup():
                    return
                time.sleep(1)
                continue
        except (OSError, ValueError, KeyError):
            # A marker read mid-write is transient; dying here would leave the worker with no cleanup path.
            time.sleep(1)
            continue
        time.sleep(0.2)


def batch():
    jobs, result_path = json.loads(sys.argv[2]), sys.argv[3]
    launcher = os.fork()
    if launcher == 0:
        os.setsid()
        if os.fork() != 0:
            os._exit(0)
        null = os.open(os.devnull, os.O_RDWR)
        for fd in (0, 1, 2):
            os.dup2(null, fd)
        os.close(null)
        started = time.monotonic()
        with ThreadPoolExecutor(max_workers=max(1, len(jobs))) as pool:
            results = list(pool.map(lambda job: stop_worker(**job), jobs))
        Path(result_path).write_text(json.dumps({'ms': round((time.monotonic() - started) * 1000), 'workers': results}))
        os._exit(0)
    os.waitpid(launcher, 0)
    print('ready', flush=True)


def main():
    profile, seconds = sys.argv[1:]
    conf = {}
    for line in (Path.home() / '.config/agent-tmux/profiles' / (profile + '.conf')).read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key, value = line.split('=', 1)
            conf[key.strip()] = value.strip()
    if not conf.get('bin') or not conf.get('headless_flags'):
        raise ValueError('agent-tmux profile needs bin and headless_flags')
    prompt = sys.stdin.read()
    argv = [os.path.expanduser(conf['bin']), *shlex.split(conf['headless_flags'])]
    argv += [*shlex.split(conf.get('headless_prompt_flag', '')), prompt]
    child = subprocess.Popen(argv, start_new_session=True)

    def stop():
        signal.signal(signal.SIGTERM, signal.SIG_IGN)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            return
        try:
            child.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass
        # The CLI may have left a tool process alive after its own exit.
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait()

    def aborted(signum, _frame):
        stop()
        sys.exit(128 + signum)

    signal.signal(signal.SIGTERM, aborted)
    signal.signal(signal.SIGINT, aborted)
    try:
        code = child.wait(timeout=float(seconds))
    except subprocess.TimeoutExpired:
        raise TimeoutError('CLI timeout after ' + seconds + ' seconds')
    finally:
        stop()
    sys.exit(code)


if __name__ == '__main__':
    try:
        if sys.argv[1] == '--guard':
            guard()
        elif sys.argv[1] == '--watch':
            watch()
        elif sys.argv[1] == '--batch':
            batch()
        else:
            main()
    except Exception as error:
        print('BYO_CLI_ERROR: ' + str(error), file=sys.stderr)
        sys.exit(1)
