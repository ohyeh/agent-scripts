#!/usr/bin/env python3
"""Numbered digest of one Claude Code transcript for the retro behavior audit (W46-11).
Landed from the W45 inline digest; adds server-side tool calls (advisor lives in `server_tool_use`
with an `advisor_tool_result`), which W45 dropped, so an auditor saw "no advisor call".
Lines: T<n> HH:MM:SS USER|META|HOOK/PLUGIN|ASSISTANT|TOOL <name>|RESULT|SERVER_TOOL <name>|SERVER_RESULT|COMPACTION
usage: session-digest.py TRANSCRIPT.jsonl OUT.txt
       session-digest.py --self-test"""
import json, os, re, sys, tempfile


def clip(s, n):
    s = re.sub(r'\s+', ' ', s or '')
    return s[:n] + ('…' if len(s) > n else '')


def text_of(c):
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return ' '.join(x.get('text', '') for x in c if isinstance(x, dict))
    return ''


def digest(path):
    out = []
    for l in open(path, errors='ignore'):
        try:
            r = json.loads(l)
        except ValueError:
            continue
        ty, m, ts = r.get('type'), r.get('message') or {}, (r.get('timestamp') or '')[11:19]
        if ty == 'user':
            c = m.get('content')
            results = [b for b in c if isinstance(b, dict) and b.get('type') == 'tool_result'] if isinstance(c, list) else []
            for b in results:
                out.append(f"{ts} RESULT{' ERR' if b.get('is_error') else ''}: {clip(text_of(b.get('content')), 300)}")
            if results:
                continue
            txt = text_of(c)
            tag = 'META' if r.get('isMeta') else 'USER'
            if re.match(r'\s*(The [\w-]+ plugin sent|Stop hook feedback|\[SYSTEM NOTIFICATION|<task-notification)', txt):
                tag = 'HOOK/PLUGIN'
            out.append(f"{ts} {tag}: {clip(txt, 1200 if tag == 'USER' else 400)}")
        elif ty == 'assistant':
            for b in m.get('content') or []:
                if not isinstance(b, dict):
                    continue
                bt = b.get('type', '')
                if bt == 'text':
                    out.append(f"{ts} ASSISTANT: {clip(b.get('text'), 1500)}")
                elif bt == 'tool_use':
                    out.append(f"{ts} TOOL {b.get('name')}: {clip(json.dumps(b.get('input'), ensure_ascii=False), 500)}")
                elif bt == 'server_tool_use':
                    out.append(f"{ts} SERVER_TOOL {b.get('name')}: {clip(json.dumps(b.get('input'), ensure_ascii=False), 500)}")
                elif bt.endswith('_tool_result'):
                    c = b.get('content')
                    redacted = isinstance(c, dict) and 'encrypted_content' in c
                    body = f"[{c.get('type')}, not readable]" if redacted else clip(text_of(c) or json.dumps(c, ensure_ascii=False), 300)
                    out.append(f"{ts} SERVER_RESULT {bt}: {body}")
        elif ty == 'system' and 'compact' in json.dumps(r)[:300]:
            out.append(f"{ts} COMPACTION")
    return [f"T{i} {line}" for i, line in enumerate(out, 1)]


def self_test():
    rows = [
        {'type': 'user', 'timestamp': '2026-11-05T12:00:00Z', 'message': {'content': 'start'}},
        {'type': 'assistant', 'timestamp': '2026-11-05T12:34:50Z', 'message': {'content': [
            {'type': 'server_tool_use', 'id': 's1', 'name': 'advisor', 'input': {}},
            {'type': 'advisor_tool_result', 'tool_use_id': 's1', 'content': {'type': 'advisor_redacted_result', 'encrypted_content': 'x'}},
            {'type': 'tool_use', 'name': 'Bash', 'input': {'command': 'ls'}}]}},
        {'type': 'user', 'timestamp': '2026-11-05T12:35:00Z', 'message': {'content': [{'type': 'tool_result', 'content': 'a.txt'}]}},
    ]
    with tempfile.NamedTemporaryFile('w', suffix='.jsonl', delete=False) as f:
        f.write('\n'.join(json.dumps(r) for r in rows))
    d = digest(f.name)
    os.unlink(f.name)
    assert d[1] == 'T2 12:34:50 SERVER_TOOL advisor: {}', d
    assert d[2].startswith('T3 12:34:50 SERVER_RESULT advisor_tool_result: [advisor_redacted_result'), d
    assert d[3].startswith('T4 12:34:50 TOOL Bash') and d[4] == 'T5 12:35:00 RESULT: a.txt', d
    print('self-test ok')


if __name__ == '__main__':
    if sys.argv[1:] == ['--self-test']:
        self_test()
    else:
        lines = digest(sys.argv[1])
        open(sys.argv[2], 'w').write('\n'.join(lines))
        print(len(lines), os.path.getsize(sys.argv[2]))
