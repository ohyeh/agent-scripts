#!/usr/bin/env python3
"""
Validate a handoff document for completeness and quality.

Checks:
- No TODO placeholders remaining
- Required sections present and populated
- No potential secrets detected
- Referenced files exist
- Sources Read `full` lines match their pack's manifest.json; `inherited full` names an existing handoff

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
    missing_recommended = check_recommended_sections(content)
    secrets_found = scan_for_secrets(content)
    existing_files, missing_files = check_file_references(content, str(base_path))

    return {
        "filepath": str(path),
        "todos_clear": todos_clear,
        "remaining_todos": remaining_todos[:5],  # Limit output
        "todo_count": len(remaining_todos) if not todos_clear else 0,
        "required_complete": required_complete,
        "missing_required": missing_required,
        "timeline_problems": timeline_problems,
        "sources_problems": sources_problems,
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
