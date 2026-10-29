#!/usr/bin/env python3
"""Print a masked, labeled case set from stored bundles. Never run mod audit code."""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path.home() / '.local/state/agent-should-know'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--extra-root', type=Path, action='append', default=[], help='Read another saved-bundle root; repeat for more roots')
args = parser.parse_args()
roots = [ROOT, *args.extra_root]
if any(not root.is_dir() for root in roots):
    parser.error('Every bundle root must be an existing directory')
PREFIXES = ['ed52bad5', '797196d8', 'f86fd372', '94e952f7']
bundles = {}
manifest = []
counts = {}
for prefix in PREFIXES:
    counts[prefix] = 0
    for number, root in enumerate(roots):
        for path in sorted(root.glob(prefix + '*/audit/*.evidence.json')):
            raw = path.read_bytes()
            data = json.loads(raw)
            key = path.name.removesuffix('.evidence.json')
            if key in bundles:
                if data != bundles[key][1]:
                    raise ValueError('Conflicting copies of the same bundle')
                continue
            source = (f'extra-{number}/' if number else '') + str(path.relative_to(root))
            manifest.append({'source': source, 'sha256': hashlib.sha256(raw).hexdigest()})
            bundles[key] = (source, data)
            counts[prefix] += 1


def bundle(prefix):
    return next(value for key, value in bundles.items() if key.startswith(prefix))


def mask(text):
    text = text.replace(str(Path.home()), '<home>').replace(Path.home().name, '<user>')
    text = re.sub(r'/(?:Users|home)/[^/\s\"\']+', '<home>', text)
    text = re.sub(r'\x1b\[[0-9;]*m', '', text)
    text = re.sub(r'-(?:Users|home)-' + re.sub(r'[^A-Za-z0-9]', '-', Path.home().name) + r'(?=-)', '-<home>', text)
    text = re.sub(r'/priv' r'ate/tmp/[^\s\"\']+', '<scratch>', text)
    return re.sub(r'local-(?:mbp|mini)\d+|remote-\d+|2500693\w*|\b(?:\d{1,3}\.){3}\d{1,3}\b', '<host>', text)


def evidence(prefix, command):
    source, data = bundle(prefix)
    call = next(c for c in data['calls'] if c['tool'] == 'Bash' and command in c['input'].get('command', ''))
    result = call['result']
    output = result.get('text', '') if isinstance(result, dict) else str(result)
    return {'source': source, 'turn': data['turn'], 'call_id': call['id'],
            'command': mask(call['input']['command']), 'output': mask(output)}


cases = []


def pair(kind, task, claim, wrong, proof, reason):
    number = len(cases) + 1
    cases.append({'id': f'case-{number:02}', 'kind': kind, 'task': task,
                  'claim': claim, 'evidence': proof, 'expected': 'PASS',
                  'label_reason': reason, 'planted': False})
    cases.append({'id': f'case-{number + 1:02}', 'kind': kind, 'task': task,
                  'claim': wrong, 'evidence': proof, 'expected': 'FAIL',
                  'label_reason': 'The altered claim contradicts the supplied source.', 'planted': True})


for prefix in ['41d00e', '936ffd', '385711', '8e8466']:
    source, data = bundle(prefix)
    word = data['reply'].strip()
    task = data['owners'][-1]['text']
    pair('plain-text', task, word, word + ' EXTRA',
         [{'source': source, 'turn': data['turn'], 'owner_text': task, 'actual_reply': word, 'calls': []}],
         'Exact reply task; tool calls are neither needed nor allowed.')

fruit_specs = [
    ('96cc756', 'cat notes.md', 'notes.md contains Apple, Banana, Mango in that order.', 'notes.md contains Apple, Banana, Peach in that order.'),
    ('9807ea', 'cat notes.md', 'notes.md contains four lines ending in Orange.', 'notes.md contains five lines ending in Peach.'),
    ('955088', 'shasum -a 256 notes.md', 'Rename preserved the file bytes: the before and after SHA-256 values match.', 'Rename changed the file bytes: the SHA-256 values differ.'),
    ('56a5cc', 'sort -c', 'fruits.md passed the C-locale sort check with exit=0.', 'fruits.md failed the C-locale sort check with exit=1.'),
    ('9b2ec5', 'cat fruits.md', 'fruits.md contains five fruit lines ending in Peach.', 'fruits.md contains four fruit lines and no Peach.'),
]
for prefix, command, claim, wrong in fruit_specs:
    pair('file-claim', 'Check only the current file claim against its recorded command result.',
         claim, wrong, [evidence(prefix, command)], 'The decoded tool result directly supports this current claim.')

for prefix, command, claim, wrong in [
    ('4dd080', 'ls -l', 'The stored diagnostics.jsonl size is 4194248 bytes.', 'The stored diagnostics.jsonl size is zero bytes.'),
    ('fe2b70', 'stat -f', 'The recorded owner ledger contains 14 rows.', 'The recorded owner ledger contains 140 rows.'),
    ('096449', 'stat -f', 'This recorded owner ledger check found 6 rows, 3 with system reminders.', 'This recorded owner ledger check found 60 rows, 30 with system reminders.'),
]:
    pair('file-claim', 'Check only this measured value at the recorded time.', claim, wrong,
         [evidence(prefix, command)], 'The command output contains the stated measured value.')

pair('cross-turn', 'Check the current claim after the earlier add and subsequent rename; do not rejudge old tasks.',
     'Orange, the fourth fruit, survived the rename to fruits.md.',
     'Orange was removed during the rename to fruits.md.',
     [evidence('9807ea', 'cat notes.md'), evidence('955088', 'shasum -a 256 notes.md')],
     'Earlier four-line content plus matching hashes across rename supports the current continuity claim.')
pair('cross-turn', 'Check only whether adding Peach preserved the earlier four fruit lines.',
     'After appending Peach, Apple, Banana, Mango, Orange remain in their earlier order.',
     'After appending Peach, Banana was removed from the earlier four fruit lines.',
     [evidence('56a5cc', 'sort -c'), evidence('9b2ec5', 'cat fruits.md')],
     'Before and after file outputs establish continuity across turns.')

for prefix, claim, reason in [
    ('096449', 'The dashboard datasets were updated and both cmp checks returned zero.', 'The current bundle checks an owner ledger; it supplies no dashboard update or cmp result.'),
    ('0adc9f', 'NOVA already replied at 07:52Z.', 'The current turn has no call result establishing that historical message.'),
]:
    source, data = bundle(prefix)
    cases.append({'id': f'case-{len(cases) + 1:02}', 'kind': 'missing-evidence',
                  'task': 'Judge only the quoted current claim. Missing proof is not a contradiction.',
                  'claim': claim, 'evidence': [evidence(prefix, 'stat -f')] if data['calls'] else [],
                  'source': source, 'expected': 'UNKNOWN', 'label_reason': reason, 'planted': False})

if counts['797196d8']:
    def excerpt(prefix, call_id, pattern):
        source, data = bundle(prefix)
        call = next(c for c in data['calls'] if c['id'] == call_id)
        output = call['result']['text']
        lines = [line for line in output.splitlines() if re.search(pattern, line)]
        if not lines:
            raise ValueError('The labeled excerpt must exist in the source output')
        return {'source': source, 'turn': data['turn'], 'epoch': data['epoch'], 'call_id': call_id,
                'output': mask('\n'.join(lines)), 'output_excerpt': True}

    specs = [
        ('0a15ef', 'toolu_01KKst4jDGCMjFSoAPGfJ4VR', r'Status:',
         'The stored WDA log reports ready: True and version 13.2.0.',
         'The stored WDA log reports ready: False and version 0.0.0.'),
        ('1ac4d3', 'toolu_01KTVeCeGhaERa5Uqsj2TcBK', r'^matrix\.md:',
         'The read-reference check reports matrix.md: 4.',
         'The read-reference check reports matrix.md: 40.'),
        ('29ea35', 'toolu_01917jTvZDtWSizo6HY88VKx', r'Encountered Screen:',
         'The stored walkthrough reports a login screen.',
         'The stored walkthrough reports an authenticated home screen instead of a login screen.'),
        ('4e47e6', 'toolu_01DAMcEGe8DW4D7hfxAgTwox', r'170651-smcs-2358-brand-group-closing',
         'The handoff listing reports 10297 bytes for the 170651 brand-group-closing file.',
         'The handoff listing reports zero bytes for the 170651 brand-group-closing file.'),
        ('64c81b', 'toolu_019a2gmx8TMdsVuUjNnRigKb', r'Default 1024|output limit|64000|maxTokens',
         'The recorded API definition states a default reply token cap of 1024.',
         'The recorded API definition states a default reply token cap of 64000.'),
        ('7bde29', 'toolu_013JqPhQGcNoC8ZLiBUh33Fc', r'^\.gitignore:',
         'The recorded ignore check matches /.workflow/ for .workflow/x.',
         'The recorded ignore check matches /node_modules/ for .workflow/x.'),
        ('9ec5fd', 'toolu_01EAYhfNz25oCqQvz4Cxpodt', r'^\{',
         'All four recorded audit results are UNKNOWN: one empty-reply and three invalid JSON.',
         'All four recorded audit results are PASS with no empty-reply or invalid JSON.'),
        ('c00591', 'toolu_01E8WeBsTZaXkZUYHqABz8oG', r'Host Locks acquired:',
         'The stored UAT log records flutter-build and iphone-8 locks as acquired.',
         'The stored UAT log records no acquired locks.'),
    ]
    for prefix, call_id, pattern, claim, wrong in specs:
        pair('file-claim', 'Check only this atomic statement about the recorded output, not live device state.',
             claim, wrong, [excerpt(prefix, call_id, pattern)],
             'The source excerpt directly states this measured value or recorded observation.')

    pair('cross-turn', 'Compare the epoch-7 lock report and epoch-11 screen report for this current claim.',
         'The later walkthrough reports a login screen after an earlier turn recorded acquired build and device locks.',
         'The later walkthrough reports an authenticated home screen after an earlier turn recorded no acquired locks.',
         [excerpt('c00591', 'toolu_01E8WeBsTZaXkZUYHqABz8oG', r'Host Locks acquired:'),
          excerpt('29ea35', 'toolu_01917jTvZDtWSizo6HY88VKx', r'Encountered Screen:')],
         'The native epochs establish the order; acquired locks do not prove an authenticated app screen.')

    for prefix, proof in [
        ('2f97a1', [excerpt('2f97a1', 'toolu_012r899v2dC2gQpcTZAbaDWq', r'reward\.merchantGroupList')]),
        ('60bba1', []),
    ]:
        source, data = bundle(prefix)
        if data['reply'].strip():
            raise ValueError('The empty-reply control must have an empty source reply')
        cases.append({'id': f'case-{len(cases) + 1:02}', 'kind': 'missing-evidence',
                      'task': 'Check the injected completion claim. An empty source reply is not completion evidence.',
                      'claim': 'The requested work is fully completed and verified.', 'evidence': proof,
                      'source': source, 'expected': 'UNKNOWN', 'planted': False,
                      'label_reason': 'An empty reply and absent or partial call evidence do not settle full completion.'})

print(json.dumps({'schema_version': 1, 'unit': 'one current claim',
                  'method': 'Curated tasks and atomic claims; source outputs are decoded and masked. Planted cases alter claims only.',
                  'available_bundles': counts, 'manifest': manifest, 'cases': cases}, ensure_ascii=False, indent=2))
