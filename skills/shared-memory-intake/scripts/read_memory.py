#!/usr/bin/env python3
"""Search shared memory without changing it; only --self-test writes temp files."""

import argparse
from contextlib import redirect_stdout
from datetime import datetime, timezone
import io
import os
from pathlib import Path
import tempfile


def sources(home):
    memory = home / ".codex/memories"
    inbox = home / ".agents/shared-memory-inbox"
    return [
        ("memory", memory / "MEMORY.md", False),
        ("summary", memory / "memory_summary.md", False),
        ("note", memory / "extensions/ad_hoc/notes", True),
        *[(kind, inbox / kind, True)
          for kind in ("pending", "processed", "rejected")],
    ]


def stamp(nanoseconds):
    return datetime.fromtimestamp(nanoseconds / 1e9, timezone.utc).isoformat()


def read_memory(home, keywords=(), status=False):
    memory = home / ".codex/memories/MEMORY.md"
    baseline = memory.stat().st_mtime_ns if memory.is_file() else None
    words = [word.casefold() for word in keywords]
    errors = False
    for kind, source, directory in sources(home):
        try:
            exists = source.is_dir() if directory else source.is_file()
            if not exists:
                print(f"{kind} missing {source}")
                if status:
                    print(f"{kind} {source} files=0 newest=none")
                continue
            files = sorted(p for p in source.glob("*.md") if p.is_file()) if directory else [source]
            if status:
                mtimes = [(path, path.stat().st_mtime_ns) for path in files]
                newest = stamp(max(mtime for _, mtime in mtimes)) if mtimes else "none"
                print(f"{kind} {source} files={len(files)} newest={newest}")
                if kind == "note":
                    for path, mtime in mtimes:
                        flag = "unknown" if baseline is None else str(mtime > baseline).lower()
                        print(f"note {path} newer-than-MEMORY.md={flag}")
            else:
                for path in files:
                    try:
                        with path.open("r", encoding="utf-8") as handle:
                            for number, line in enumerate(handle, 1):
                                line = line.rstrip("\r\n")
                                if any(word in line.casefold() for word in words):
                                    print(f"{kind} {path}:{number} {line[:200]}")
                    except (OSError, UnicodeError) as error:
                        print(f"{kind} error {path}: {type(error).__name__}: {error}")
                        errors = True
        except OSError as error:
            print(f"{kind} error {source}: {type(error).__name__}: {error}")
            errors = True
    return int(errors)


def self_test():
    with tempfile.TemporaryDirectory(prefix="read-memory-test-") as root:
        home = Path(root)
        for kind, source, directory in sources(home):
            if kind == "rejected":
                continue
            path = source / "test.md" if directory else source
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("Unrelated\nMiXeD keyword " + "x" * 210 + "\n", encoding="utf-8")
            os.utime(path, ns=(2_000_000_000, 2_000_000_000))
        note = home / ".codex/memories/extensions/ad_hoc/notes/test.md"
        os.utime(note, ns=(3_000_000_000, 3_000_000_000))
        output = io.StringIO()
        with redirect_stdout(output):
            assert read_memory(home, ["absent", "mixed"]) == 0
        lines = output.getvalue().splitlines()
        for kind in ("memory", "summary", "note", "pending", "processed"):
            hit = next(line for line in lines if line.startswith(kind + " "))
            assert ":2 " in hit and len(hit.split(":2 ", 1)[1]) == 200, hit
        assert any(line.startswith("rejected missing ") for line in lines)
        output = io.StringIO()
        with redirect_stdout(output):
            assert read_memory(home, status=True) == 0
        assert f"note {note} newer-than-MEMORY.md=true" in output.getvalue()
        os.utime(note, ns=(2_000_000_000, 2_000_000_000))
        output = io.StringIO()
        with redirect_stdout(output):
            assert read_memory(home, status=True) == 0
        assert f"note {note} newer-than-MEMORY.md=false" in output.getvalue()
    print("self-test ok")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("keywords", nargs="*", help="Match any keyword, without case differences")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--status", action="store_true", help="Show file counts, mtimes, and note flags")
    mode.add_argument("--self-test", action="store_true", help="Test with a temporary tree")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if not args.status and not args.keywords:
        parser.error("provide keywords or --status")
    return read_memory(Path.home(), args.keywords, args.status)


if __name__ == "__main__":
    raise SystemExit(main())
