#!/usr/bin/env python3
"""
Validate a handoff document for completeness and quality.

Checks:
- No TODO placeholders remaining
- Required sections present and populated
- No potential secrets detected
- Referenced files exist
- Sources Read `full` lines match their pack's manifest.json; `inherited full` names an existing handoff
- Working Methods rows cite a run record, and carry every row of the continued handoff

Usage:
    python validate_handoff.py <handoff-file>
    python validate_handoff.py .claude/handoffs/2024-01-15-143022-auth.md
"""

import json
import os
import re
import sys
from pathlib import Path

# Secret detection patterns
SECRET_PATTERNS = [
    (r'["\']?[a-zA-Z_]*api[_-]?key["\']?\s*[:=]\s*["\'][^"\']{10,}["\']', "API key"),
    (r'["\']?[a-zA-Z_]*password["\']?\s*[:=]\s*["\'][^"\']+["\']', "Password"),
    (r'["\']?[a-zA-Z_]*secret["\']?\s*[:=]\s*["\'][^"\']{10,}["\']', "Secret"),
    (r'["\']?[a-zA-Z_]*token["\']?\s*[:=]\s*["\'][^"\']{20,}["\']', "Token"),
    (r'["\']?[a-zA-Z_]*private[_-]?key["\']?\s*[:=]', "Private key"),
    (r'-----BEGIN [A-Z]+ PRIVATE KEY-----', "PEM private key"),
    (r'mongodb(\+srv)?://[^/\s]+:[^@\s]+@', "MongoDB connection string with password"),
    (r'postgres://[^/\s]+:[^@\s]+@', "PostgreSQL connection string with password"),
    (r'mysql://[^/\s]+:[^@\s]+@', "MySQL connection string with password"),
    (r'Bearer\s+[a-zA-Z0-9_\-\.]+', "Bearer token"),
    (r'ghp_[a-zA-Z0-9]{36}', "GitHub personal access token"),
    (r'sk-[a-zA-Z0-9]{48}', "OpenAI API key"),
    (r'xox[baprs]-[a-zA-Z0-9-]+', "Slack token"),
]

# Required sections for a complete handoff
REQUIRED_SECTIONS = [
    "Current State Summary",
    "Important Context",
    "Immediate Next Steps",
    "Timeline",
]

# Recommended sections
RECOMMENDED_SECTIONS = [
    "Architecture Overview",
    "Critical Files",
    "Files Modified",
    "Decisions Made",
    "Assumptions Made",
    "Potential Gotchas",
]


def check_todos(content: str) -> tuple[bool, list[str]]:
    """Check for remaining TODO placeholders."""
    todos = re.findall(r'\[TODO:[^\]]*\]', content)
    return len(todos) == 0, todos


def check_required_sections(content: str) -> tuple[bool, list[str]]:
    """Check that required sections exist and have content."""
    missing = []
    # any list-item form counts: "- Blocker:", "- [ ] Blocker:", "* [x] Blocker:", "1. Blocker:"
    if re.search(r"^\s*(?:[-*+]|\d+\.)\s*(?:\[[ xX]\]\s*)?Blocker\s*:", content, re.M | re.I):
        m = re.search(r"### Ruled-Out Paths\n(.*?)(?=\n#{2,3} |\Z)", content, re.S)
        body = m.group(1) if m else ""
        filled = re.search(r"^- Path: (?!\[TODO)\S.*- Evidence: (?!\[)\S.*- Cost: (?!\[)\S", body, re.M)
        if not m:
            missing.append("Ruled-Out Paths (required when a Blocker is listed)")
        elif not filled:
            missing.append("Ruled-Out Paths (incomplete: needs a filled '- Path: … - Evidence: … - Cost: …' row)")
    for section in REQUIRED_SECTIONS:
        # Look for section header
        # The scaffold emits some of these at h3 and some at h2, so match any
        # heading level; the section ends at the next heading of the SAME or a
        # higher level, never at its own subheadings.
        pattern = rf'(?:^|\n)(#{{2,6}})\s*{re.escape(section)}'
        match = re.search(pattern, content, re.IGNORECASE)
        if not match:
            missing.append(f"{section} (missing)")
        else:
            level = len(match.group(1))
            section_start = match.end()
            next_section = re.search(rf'\n#{{2,{level}}}\s+', content[section_start:])
            section_end = section_start + next_section.start() if next_section else len(content)
            section_content = content[section_start:section_end].strip()

            # 50 chars minimum: roughly 1-2 sentences, enough to convey meaningful context
            if len(section_content) < 50 or '[TODO' in section_content:
                missing.append(f"{section} (incomplete)")

    return len(missing) == 0, missing


def check_timeline(content: str) -> list[str]:
    """Timeline must hold one `user` row per user message, as counted by the `COUNT <n>` lines."""
    m = re.search(r'(?:^|\n)(#{2,6})\s*Timeline', content, re.I)
    if not m:
        return []  # a missing section is already reported by check_required_sections
    body = re.split(rf'\n#{{2,{len(m.group(1))}}}\s+', content[m.end():])[0]
    counts = [int(n) for n in re.findall(r'COUNT\s+(\d+)', body)]
    if not counts:
        return ["Timeline has no `COUNT <n>` line from the session-log filter"]
    rows = sum(
        1 for line in body.splitlines()
        if line.lstrip().startswith('|')
        and len(cells := line.strip().strip('|').split('|')) > 1
        and cells[1].strip().lower() == 'user'
    )
    if rows != sum(counts):
        return [f"Timeline has {rows} user row(s) but the COUNT line(s) total {sum(counts)}"]
    return []


# A filled row: the path or URL is not the template placeholder, a [TODO, or `none`.
ARTIFACT_ROW = re.compile(
    r'(?!none |\[path or url\]|<path or url>|\[todo)\S.*? · (?:artifact|md|memory|run-dir|other)'
    r' · must-read: (?:yes|no)(?: · .+)?', re.I)
NONE_ROW = re.compile(r'none · (?!\[reason\]|<reason>).*\w.*', re.I)


def check_artifacts(content: str) -> list[str]:
    """Every product the next agent needs (Artifact pages, .md files, memory, run dirs) is listed,
    each marked must-read; a single `- none · <reason>` states there is none."""
    # a quoted example inside a fenced block is not a row or a heading
    # (a closing fence carries no text; an unclosed fence runs to the end of the file)
    fence = r'(?ms)^[ \t]*(`{3,}|~{3,}).*?(?:^[ \t]*\1[`~]*[ \t]*$|(\Z))'
    unclosed = any(x.group(2) is not None for x in re.finditer(fence, content))
    content = re.sub(fence, '', content)
    m = re.search(r'^(#{2,6})[ \t]*Artifacts[ \t#]*$', content, re.M | re.I)
    if not m and unclosed:
        return ["A code fence is not closed, so the rest of the file reads as code: close it, then re-run"]
    if not m:
        return ["Artifacts section missing: list each product as "
                "`- <path or URL> · artifact|md|memory|run-dir|other · must-read: yes|no`, or `- none · <reason>`"]
    # the section ends at the next heading of the same or a higher level
    body = re.split(rf'^#{{1,{len(m.group(1))}}}[ \t]', content[m.end():], maxsplit=1, flags=re.M)[0]
    rows = re.findall(r'^[ \t]*[-*][ \t]+(.*\S)', body, re.M)
    if len(rows) == 1 and NONE_ROW.fullmatch(rows[0]):
        return []
    if rows and all(ARTIFACT_ROW.fullmatch(r) for r in rows):
        return []
    return ["Artifacts needs a filled row per product "
            "(`- <path or URL> · <kind> · must-read: yes|no`), or one `- none · <reason>` row"]


FENCE = r'(?ms)^[ \t]*(`{3,}|~{3,}).*?(?:^[ \t]*\1[`~]*[ \t]*$|(\Z))'
# One run record per row: a file path:line[-line] or a commit sha; never "used before", a time, a brief or a plan.
REC = r'(?:[\w./~-]+\.\w+:\d+(?:-\d+)?|[0-9a-fA-F]{7,40})'
NOT_RUN = re.compile(r'(?:^|/)(?:briefs?/|brief[^/]*$|plan[^/]*$)', re.I)
METHOD_ROW = re.compile(
    r'(?!\[|none |retired:)(?P<what>\S.*?) · (?:worked|failed) · \d{4}-\d{2}-\d{2} · (?P<rec>[^·]*?) · (?P<cond>.*\w.*)',
    re.I)
RETIRED_ROW = re.compile(r'retired: (?P<what>.+?) · (?P<old>[^·]*?) · (?P<new>[^·]*)', re.I)
# A predecessor row may predate the required conditions field.
PREV_ROW = re.compile(
    r'(?!\[|none |retired:)(?P<what>\S.*?) · (?P<out>worked|failed) · (?P<date>\d{4}-\d{2}-\d{2}) · (?P<rec>[^·]*?)'
    r'(?: · (?P<cond>.*\w.*))?', re.I)


def record(field: str):
    """The one record a field holds, or None: backticks aside, the whole field is one path:line or sha."""
    f = field.strip().strip('`').strip()
    if not re.fullmatch(REC, f) or NOT_RUN.search(f.split(':')[0]):
        return None
    if ':' not in f:
        return f.lower()
    path, _, lines = f.rpartition(':')
    start, _, end = lines.partition('-')
    start, end = int(start), int(end or start)
    if start < 1 or end < start:
        return None
    return f"{path}:{start}-{end}"


def norm(text: str) -> str:
    return ' '.join(text.split())


def section_body(content: str, name: str):
    """Text of a section, or None when the section is missing; fenced examples do not count."""
    content = re.sub(FENCE, '', content)
    m = re.search(rf'^(#{{2,6}})[ \t]*{re.escape(name)}[ \t#]*$', content, re.M | re.I)
    if not m:
        return None
    return re.split(rf'^#{{1,{len(m.group(1))}}}[ \t]', content[m.end():], maxsplit=1, flags=re.M)[0]


def section_rows(content: str, name: str):
    """List rows of a section, or None when the section is missing; fenced examples do not count."""
    body = section_body(content, name)
    return None if body is None else re.findall(r'^[ \t]*[-*][ \t]+(.*\S)', body, re.M)


def record_file_problems(recs: set, base_path: Path, warnings: list) -> list[str]:
    """A path:line that resolves here must point inside the file; a file not found here is a WARN."""
    problems, seen = [], set()
    for r in sorted(x for x in recs if ':' in x):
        path, line = r.rsplit(':', 1)
        f = Path(path).expanduser()
        f = f if f.is_absolute() else base_path / f
        if not f.is_file():
            if os.path.realpath(f) not in seen:
                seen.add(os.path.realpath(f))
                warnings.append(f"{path} (Working Methods record; open it on the host that holds it)")
            continue
        n = len(f.read_text(errors='replace').splitlines())
        if int(line.split('-')[-1]) > n:
            problems.append(f"Working Methods record {r} points past the end of the file ({n} lines)")
    return problems


def check_working_methods(content: str, handoff_dir: Path, base_path: Path = None,
                          warnings: list = None) -> list[str]:
    """How the task was done must survive the chain: each method cites one run record and its
    conditions, and every row of the continued handoff is carried whole or retired by name (a
    11-25 handoff turned a proven method into an unsourced assumption, and the next session dropped it)."""
    rows = section_rows(content, "Working Methods")
    if rows is None:
        return ["Working Methods section missing: one row per method or tool, "
                "`- <what> · worked|failed · YYYY-MM-DD · <one run record path:line or sha> · <conditions or unknown>`"]
    if not rows:
        return ["Working Methods section is empty: add method rows, or one `- none · <reason>` row"]
    methods = [m for m in map(METHOD_ROW.fullmatch, rows) if m]
    retired = [m for m in map(RETIRED_ROW.fullmatch, rows) if m]
    root = base_path or handoff_dir.parent.parent

    def same_record(field):
        """A record as the file it resolves to under the project root, so spellings of one line match."""
        r = record(field)
        if not r or ':' not in r:
            return r
        path, lines = r.rsplit(':', 1)
        return f"{os.path.realpath(os.path.join(root, os.path.expanduser(path)))}:{lines}"

    def row_ok(r):
        if m := METHOD_ROW.fullmatch(r):
            return bool(record(m['rec']))
        if m := RETIRED_ROW.fullmatch(r):
            old, new = same_record(m['old']), same_record(m['new'])
            return bool(old and new and old != new)
        return bool(NONE_ROW.fullmatch(r)) and not methods
    problems = [f"Working Methods row needs one run record (file path:line or sha, not a brief or plan), "
                f"a different newer record when retired, and its conditions or `unknown`: {r[:90]}"
                for r in rows if not row_ok(r)]
    if sum(bool(NONE_ROW.fullmatch(r)) for r in rows) > 1:
        problems.append("Working Methods has more than one `none` row")
    recs = {x for x in [record(m['rec']) for m in methods]
            + [record(m[k]) for m in retired for k in ('old', 'new')] if x}
    if base_path:
        problems += record_file_problems(recs, base_path, warnings if warnings is not None else [])
    chains = re.findall(r'^#{2,6}[ \t]*Handoff Chain[ \t#]*$', re.sub(FENCE, '', content), re.M | re.I)
    links = [x.strip() for x in re.findall(r'^[-*][ \t]+\*\*Continues from\*\*:(.*)$',
                                           section_body(content, "Handoff Chain") or '', re.M)]
    if len(chains) > 1:
        links = []
    target = len(links) == 1 and re.fullmatch(r'\[[^\]]*\]\((?:\./)?([^)\s]+)\)', links[0])
    if len(links) != 1 or not (target or links[0] == "None (fresh start)"):
        return problems + ["Handoff Chain needs exactly one `- **Continues from**: [file](./file)` "
                           "or `- **Continues from**: None (fresh start)`"]
    if not target:
        return problems
    prev_path = handoff_dir / target[1]
    if not prev_path.is_file():
        return problems + [f"Continues from names {target[1]}, which is not in {handoff_dir}"]
    def key(m):
        return norm(m['what']), m['out'].lower(), m['date'], same_record(m['rec'])
    kept = {}
    for m in map(PREV_ROW.fullmatch, rows):
        if m and m['cond']:
            kept.setdefault(key(m), set()).add(norm(m['cond']))
    gone = {(norm(m['what']), same_record(m['old'])) for m in retired}
    for r in section_rows(prev_path.read_text(), "Working Methods") or []:
        m = PREV_ROW.fullmatch(r)
        if not m or not record(m['rec']) or (norm(m['what']), same_record(m['rec'])) in gone:
            continue
        if key(m) in kept and (m['cond'] is None or norm(m['cond']) in kept[key(m)]):
            continue
        problems.append(f"Working Methods drops or rewrites a row of {prev_path.name}: {r[:90]} "
                        f"(copy it whole, or add `- retired: {m['what']} · {m['rec'].strip()} · <newer record>`)")
    return problems


def check_sources_read(content: str, handoff_dir: Path, base_path: Path) -> list[str]:
    """A copied `full` mark would let the next resume skip a re-read: re-check it against the pack.

    resume_pack.py writes <out>/<sid8>/manifest.json with count and tools but no sid, so the
    sid8 is checked against the pack directory's name.
    """
    m = re.search(r'(?:^|\n)(#{2,6})\s*Sources Read', content, re.I)
    if not m:
        return []
    body = re.split(rf'\n#{{2,{len(m.group(1))}}}\s+', content[m.end():])[0]
    problems = []
    for sid, count, tools, pack in re.findall(
            r'^\s*[-*]\s*([0-9a-f]{8}) full · COUNT (\d+) · TOOLS (\d+) · pack (\S+)', body, re.M):
        directory = Path(pack).expanduser()
        if not directory.is_absolute() and not directory.is_dir():
            directory = base_path / directory
        try:
            manifest = json.loads((directory / "manifest.json").read_text())
        except (OSError, ValueError) as e:
            problems.append(f"Sources Read: {sid} full — pack {pack} has no readable manifest.json ({type(e).__name__})")
            continue
        if directory.name != sid or (manifest.get("count"), manifest.get("tools")) != (int(count), int(tools)):
            problems.append(
                f"Sources Read: {sid} full COUNT {count} TOOLS {tools} does not match pack {pack} "
                f"(dir {directory.name}, COUNT {manifest.get('count')}, TOOLS {manifest.get('tools')})")
    for sid, name in re.findall(r'^\s*[-*]\s*([0-9a-f]{8}) inherited full \(from ([^)]+)\)', body, re.M):
        if not any((d / name.strip()).is_file() for d in (handoff_dir, base_path / ".claude" / "handoffs")):
            problems.append(f"Sources Read: {sid} inherited full names handoff {name} that does not exist")
    return problems


def check_recommended_sections(content: str) -> list[str]:
    """Check which recommended sections are missing."""
    missing = []
    for section in RECOMMENDED_SECTIONS:
        pattern = rf'(?:^|\n)#{{2,6}}\s*{re.escape(section)}'
        if not re.search(pattern, content, re.IGNORECASE):
            missing.append(section)
    return missing


# A value that is already redacted is not a leak. Measured against real
# handoffs: `HEALTHGO_UAT_PASSWORD="..."` blocked a handoff whose value was
# literally three dots.
REDACTED_VALUE = re.compile(
    r'^[\'"`\s]*(\.{2,}|\*{2,}|x{3,}|<[^>]*>|\$\{[^}]*\}|\$[A-Z_]+|'
    r'redacted|placeholder|todo|xxx+|'
    r'your[_-]?(name|value|key|token|secret|password|username|email|'
    r'domain|org|company|project|api[_-]?key|here)?)[\'"`\s]*$',
    re.IGNORECASE)


def scan_for_secrets(content: str) -> list[tuple[str, str]]:
    """Scan content for potential secrets, ignoring redacted placeholders."""
    findings = []
    for pattern, description in SECRET_PATTERNS:
        real = []
        for m in re.finditer(pattern, content, re.IGNORECASE):
            hit = m.group(0)
            value = re.split(r'[:=]', hit, maxsplit=1)[-1] if re.search(r'[:=]', hit) else hit
            if not REDACTED_VALUE.match(value):
                real.append(hit)
        if real:
            findings.append((description, f"Found {len(real)} potential match(es)"))
    return findings


def check_file_references(content: str, base_path: str) -> tuple[list[str], list[str]]:
    """Check if referenced files exist."""
    # Extract file paths from content (look for common patterns)
    # Pattern 1: | path/to/file | in tables
    # Pattern 2: `path/to/file` in code
    # Pattern 3: path/to/file:123 with line numbers

    patterns = [
        r'\|\s*([a-zA-Z0-9_\-./]+\.[a-zA-Z]+)\s*\|',  # Table cells
        r'`([a-zA-Z0-9_\-./]+\.[a-zA-Z]+(?::\d+)?)`',  # Inline code
        r'(?:^|\s)([a-zA-Z0-9_\-./]+\.[a-zA-Z]+:\d+)',  # With line numbers
    ]

    found_files = set()
    for pattern in patterns:
        matches = re.findall(pattern, content)
        for match in matches:
            # Remove line numbers
            filepath = match.split(':')[0]
            # Skip obvious non-files
            if filepath and not filepath.startswith('http') and '/' in filepath:
                found_files.add(filepath)

    existing = []
    missing = []

    for filepath in found_files:
        full_path = Path(base_path) / filepath
        if full_path.exists():
            existing.append(filepath)
        else:
            missing.append(filepath)

    return existing, missing


def validate_handoff(filepath: str) -> dict:
    """Run all validations on a handoff file."""
    path = Path(filepath)

    if not path.exists():
        return {"error": f"File not found: {filepath}"}

    content = path.read_text()
    # Cited paths are repo-relative. Walk up to the directory that holds
    # .claude/ rather than assuming a fixed depth, so the check still resolves
    # when a handoff is read from anywhere else.
    base_path = path.parent
    for parent in path.parents:
        if (parent / ".claude").is_dir():
            base_path = parent
            break

    # Run checks
    todos_clear, remaining_todos = check_todos(content)
    required_complete, missing_required = check_required_sections(content)
    timeline_problems = check_timeline(content)
    sources_problems = check_sources_read(content, path.parent, base_path)
    artifact_problems = check_artifacts(content)
    method_warnings = []
    method_problems = check_working_methods(content, path.parent, base_path, method_warnings)
    missing_recommended = check_recommended_sections(content)
    secrets_found = scan_for_secrets(content)
    existing_files, missing_files = check_file_references(content, str(base_path))
    resolve = lambda f: os.path.realpath(os.path.join(base_path, os.path.expanduser(f)))
    noted = {resolve(w.split(" (Working Methods record")[0]) for w in method_warnings}
    missing_files = method_warnings + [f for f in missing_files if resolve(f) not in noted]

    return {
        "filepath": str(path),
        "todos_clear": todos_clear,
        "remaining_todos": remaining_todos[:5],  # Limit output
        "todo_count": len(remaining_todos) if not todos_clear else 0,
        "required_complete": required_complete,
        "missing_required": missing_required,
        "timeline_problems": timeline_problems,
        "sources_problems": sources_problems,
        "artifact_problems": artifact_problems,
        "method_problems": method_problems,
        "missing_recommended": missing_recommended,
        "secrets_found": secrets_found,
        "files_verified": len(existing_files),
        "files_missing": missing_files[:5],  # Limit output
    }


def print_report(result: dict):
    """Print a formatted validation report."""
    if "error" in result:
        print(f"Error: {result['error']}")
        return False

    print(f"\n{'='*60}")
    print(f"Handoff Validation Report")
    print(f"{'='*60}")
    print(f"File: {result['filepath']}")
    print(f"{'='*60}")

    # TODOs
    if result['todos_clear']:
        print("\n[PASS] No TODO placeholders remaining")
    else:
        print(f"\n[FAIL] {result['todo_count']} TODO placeholders found:")
        for todo in result['remaining_todos']:
            print(f"       - {todo[:50]}...")

    # Required sections
    if result['required_complete']:
        print("\n[PASS] All required sections complete")
    else:
        print("\n[FAIL] Missing/incomplete required sections:")
        for section in result['missing_required']:
            print(f"       - {section}")

    # Timeline
    if result['timeline_problems']:
        print("\n[FAIL] Timeline check:")
        for problem in result['timeline_problems']:
            print(f"       - {problem}")
    elif "Timeline (missing)" in result['missing_required']:
        print("\n[SKIP] Timeline check: section missing")
    else:
        print("\n[PASS] Timeline user rows match COUNT")

    # Sources Read
    if result['sources_problems']:
        print("\n[FAIL] Sources Read check:")
        for problem in result['sources_problems']:
            print(f"       - {problem}")
    else:
        print("\n[PASS] Sources Read marks match their packs")

    # Working Methods
    if result['method_problems']:
        print("\n[FAIL] Working Methods check:")
        for problem in result['method_problems']:
            print(f"       - {problem}")
    else:
        print("\n[PASS] Working Methods rows cite run records and carry the continued handoff")

    # Secrets
    if not result['secrets_found']:
        print("\n[PASS] No potential secrets detected")
    else:
        print("\n[WARN] Potential secrets detected:")
        for secret_type, detail in result['secrets_found']:
            print(f"       - {secret_type}: {detail}")

    # File references
    if result['files_missing']:
        print(f"\n[WARN] {len(result['files_missing'])} referenced file(s) not found:")
        for f in result['files_missing']:
            print(f"       - {f}")
    else:
        print(f"\n[INFO] {result['files_verified']} file reference(s) verified")

    # Recommended sections
    if result['missing_recommended']:
        print(f"\n[INFO] Consider adding these sections:")
        for section in result['missing_recommended']:
            print(f"       - {section}")

    print(f"\n{'='*60}")

    # Final verdict: a list of concrete blockers. The upstream 0-100 quality
    # score was removed — it scored heading presence, so a handoff full of
    # unfilled TODOs still passed its 70 threshold.
    blockers = []
    if result['secrets_found']:
        blockers.append(f"remove {len(result['secrets_found'])} potential secret(s)")
    if not result['todos_clear']:
        blockers.append(f"fill {result['todo_count']} remaining [TODO: ...] placeholder(s)")
    if result['missing_required']:
        blockers.append("add required section(s): " + ", ".join(result['missing_required']))
    blockers.extend(result['timeline_problems'])
    blockers.extend(result['sources_problems'])
    blockers.extend(result['artifact_problems'])
    blockers.extend(result['method_problems'])

    if blockers:
        print("Verdict: BLOCKED")
        for b in blockers:
            print(f"  - {b}")
        return False

    print("Verdict: READY for handoff")
    if result['missing_recommended'] or result['files_missing']:
        print("  (non-blocking gaps listed above)")
    return True


def self_test():
    import tempfile
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / ".claude" / "handoffs").mkdir(parents=True)
        (root / ".claude" / "handoffs" / "older.md").write_text("x")
        pack = root / "pack" / "abcd1234"
        pack.mkdir(parents=True)
        (pack / "manifest.json").write_text(json.dumps({"count": 5, "tools": 7}))

        def problems(*lines):
            text = "## Sources Read\n\n" + "\n".join(lines) + "\n\n## Next\n- abcd1234 full · COUNT 1 · TOOLS 1 · pack /nope\n"
            return check_sources_read(text, root / ".claude" / "handoffs", root)

        good = f"- abcd1234 full · COUNT 5 · TOOLS 7 · pack {pack}"
        assert problems(good) == []
        assert problems(good.replace("COUNT 5", "COUNT 4"))      # copied mark, other COUNT
        assert problems(good.replace("TOOLS 7", "TOOLS 8"))
        assert problems(good.replace("abcd1234", "ffff0000"))     # another session's pack
        assert problems("- abcd1234 full · COUNT 5 · TOOLS 7 · pack /nope")  # pack gone
        assert problems("- abcd1234 full · COUNT 5 · TOOLS 7 · pack pack/abcd1234") == []  # repo-relative
        assert problems("- abcd1234 inherited full (from older.md)") == []
        assert problems("- abcd1234 inherited full (from gone.md)")
        assert problems("- abcd1234 partial (agent side not read)") == []
        assert check_sources_read("no such section", root, root) == []
        fenced = "# H\n```\nx\n```\n\n## Artifacts\n- none · nothing made\n"
        assert check_artifacts(fenced) == []
        assert "not closed" in check_artifacts(fenced.replace("x\n```\n", "x\n"))[0]
        hd = root / ".claude" / "handoffs"
        fresh = "## Handoff Chain\n- **Continues from**: None (fresh start)\n\n"
        chained = "## Handoff Chain\n- **Continues from**: [prev.md](./prev.md)\n\n"
        wm = lambda *rows, chain=fresh: chain + "## Working Methods\n" + "".join(f"- {r}\n" for r in rows) + "\n## Next\n"
        ok = lambda *rows, **k: check_working_methods(wm(*rows, **k), hd) == []
        bad = lambda *rows, **k: bool(check_working_methods(wm(*rows, **k), hd))
        cdp = "CDP memory load · worked · 2026-11-23 · run/state.md:32 · Android only"
        proxy = "proxy · failed · 2026-11-23 · run/state.md:18 · Android"
        assert check_working_methods("## Other\n", hd)                              # section missing
        assert check_working_methods(fresh + "## Working Methods\n\n## Next\n", hd)  # empty section
        assert ok(cdp) and ok("none · no method this task") and ok("Pinned commit · worked · 2026-11-23 · 3A9F977 · any host")
        assert ok("CDP · worked · 2026-11-23 · `run/state.md:3` · unknown")             # backticks aside
        for rec in ("used before", "used at 10:02", "brief-v1.md:10", "run/briefs/v1.md:1", "run/plan.md:1",
                    "run/state.md:0", "run/state.md:9-2", "https://example.test/path/state.md:2",
                    "see run/state.md:3", "run/state.md:3 and run/state.md:4"):
            assert bad(f"CDP · worked · 2026-11-23 · {rec} · Android"), rec
        assert bad("CDP · worked · 2026-11-23 · run/state.md:3")                      # no conditions
        assert bad("none · a", "none · b")                                            # two none rows
        assert check_working_methods(cdp, hd)                                         # no Handoff Chain
        assert check_working_methods("Notes: Continues from**: [x.md](./x.md)\n" + "## Working Methods\n- " + cdp, hd)
        (root / "run").mkdir()
        (root / "run" / "state.md").write_text("x\n" * 5)
        w = []
        assert check_working_methods(wm("CDP · worked · 2026-11-23 · run/state.md:32 · Android"), hd, root)  # past end
        assert check_working_methods(wm("CDP · worked · 2026-11-23 · run/gone.md:3 · Android"), hd, root, w) == []
        assert w and "run/gone.md" in w[0]                                             # missing file: WARN only
        (hd / "prev.md").write_text(wm(cdp, "old · worked · 2026-11-20 · used before · x"))
        retire = "retired: CDP memory load · run/state.md:32 · run/state2.md:5"
        assert bad(proxy, chain=chained)                                               # row dropped
        assert ok(cdp, proxy, chain=chained)                                           # carried whole; unrecorded row skipped
        assert bad(cdp.replace("worked", "failed"), chain=chained)                     # outcome rewritten
        assert bad(cdp.replace("Android only", "Linux supported"), chain=chained)      # conditions rewritten
        assert bad(cdp.replace(":32", ":3"), chain=chained)                            # :32 is not :3
        assert ok(retire, chain=chained) and ok(retire, "none · no new method", chain=chained)
        assert bad("retired: CDP memory load · run/state.md:32 · just dropped it", chain=chained)
        assert bad("retired: CDP memory load · run/state.md:32 · run/state.md:32", chain=chained)  # same record
        assert bad("retired: proxy · run/state.md:32 · run/state2.md:5", chain=chained)  # other method
        assert ok(proxy, cdp, chain=chained.replace("(./", "("))                       # link without ./
        assert bad(proxy, chain=chained.replace("prev.md)", "gone.md)"))               # link to no file
        assert bad(proxy, chain="## Handoff Chain\n- **Continues from**: prev.md\n\n")  # not a link
        shadow = "## Notes\n```\n- **Continues from**: [other.md](./other.md)\n```\n"
        assert bad(proxy, chain=shadow + chained)                                      # fenced example ignored
        assert bad(proxy, chain="## Handoff Chain\n- **Continues from**: None (fresh start)\n- **Continues from**: [prev.md](./prev.md)\n\n")
        assert bad(proxy, chain="## Handoff Chain\n- **Continues from**: None yet; this continues prev.md\n\n")
        assert bad("retired: CDP memory load · run/state.md:32 · ./run/state.md:32", chain=chained)  # same line, other spelling
        assert bad("retired: CDP memory load · run/state.md:32 · run/state.md:32-32", chain=chained)
        assert ok("retired: CDP memory load · ./run/state.md:32-32 · run/state.md:33", chain=chained)
        (hd / "prev.md").write_text(wm("CDP · worked · 2026-11-23 · run/state.md:2"))  # older four-field row
        assert bad("none · no method", chain=chained)                                  # legacy row still carried
        assert ok("CDP · worked · 2026-11-23 · run/state.md:2 · unknown", chain=chained)
        assert bad("CDP · failed · 2026-11-23 · run/state.md:2 · unknown", chain=chained)
        two = ("CDP · worked · 2026-11-23 · run/state.md:2 · Android only", "CDP · worked · 2026-11-23 · run/state.md:2 · Linux only")
        (hd / "prev.md").write_text(wm(*two))
        assert ok(*two, chain=chained)                                                 # two conditions, one record
        assert bad(two[0], chain=chained)                                              # one of them dropped
        assert bad(f"retired: CDP · run/state.md:2 · {root}/run/state.md:2", chain=chained)  # absolute = relative
        assert bad("none · no method", chain="## Handoff Chain\n- **Continues from**: None (fresh start)\n\n" + chained)
        assert bad("none · no method", chain="## Handoff Chain\n- **Continues from**:\n\n")
        w = []
        check_working_methods(wm("a · worked · 2026-11-23 · run/missing.md:2 · x", "b · worked · 2026-11-23 · run/missing.md:3 · x"), hd, root, w)
        assert len(w) == 1, w                                                          # one WARN per missing file
        w = []
        check_working_methods(wm("a · worked · 2026-11-23 · run/missing.md:2 · x", f"b · worked · 2026-11-23 · {root}/run/missing.md:3 · x"), hd, root, w)
        assert len(w) == 1, w                                                          # relative and absolute: one WARN
        (root / "run" / "alias.md").symlink_to(root / "run" / "state.md")
        assert bad("retired: CDP · run/state.md:2 · run/alias.md:2", chain=chained)    # symlink to the same line
        assert ok("retired: CDP · run/state.md:2 · run/alias.md:3", chain=chained)     # a different line passes
        (root / "other" / "inner").mkdir(parents=True)
        (root / "other" / "state.md").write_text("y\n" * 5)
        (root / "run" / "hop").symlink_to(root / "other" / "inner")
        (hd / "prev.md").write_text(wm("CDP · worked · 2026-11-23 · other/state.md:2 · Android"))
        assert bad("retired: CDP · other/state.md:2 · run/hop/../state.md:2", chain=chained)  # symlink then ..: same file
        (hd / "prev.md").write_text(wm("CDP · worked · 2026-11-23 · run/state.md:2 · Android"))
        assert ok("retired: CDP · run/state.md:2 · run/hop/../state.md:2", chain=chained)     # it is other/state.md
    print("self-test ok")


def main():
    if sys.argv[1:] == ["--self-test"]:
        return self_test()
    if len(sys.argv) < 2:
        print("Usage: python validate_handoff.py <handoff-file>")
        print("Example: python validate_handoff.py .claude/handoffs/2024-01-15-auth.md")
        sys.exit(1)

    filepath = sys.argv[1]
    result = validate_handoff(filepath)
    success = print_report(result)

    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
