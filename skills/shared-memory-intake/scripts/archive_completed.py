#!/usr/bin/env python3
"""Plan or archive completed inbox files older than 60 days; never delete content."""

import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import tempfile
import time


def archive(home, apply=False):
    inbox = home / ".agents/shared-memory-inbox"
    lease = inbox / ".curator.lock"
    acquired = False
    moved = 0
    try:
        if apply:
            inbox.mkdir(parents=True, exist_ok=True)
            lease.mkdir()
            acquired = True
        cutoff = time.time() - 60 * 86400
        for source in (inbox / "processed", home / ".agents/retro-inbox/done"):
            for path in sorted(source.glob("*.md")):
                if path.is_symlink() or not path.is_file():
                    continue
                mtime = path.stat().st_mtime
                if mtime >= cutoff:
                    continue
                month = datetime.fromtimestamp(mtime, timezone.utc).strftime("%Y-%m")
                target = source / "archive" / month / path.name
                if (source.is_symlink() or target.parent.parent.is_symlink()
                        or target.parent.is_symlink() or target.exists() or target.is_symlink()):
                    raise FileExistsError(f"unsafe or existing archive target: {target}")
                print(f"{'move' if apply else 'plan'} {path} -> {target}")
                if apply:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    path.rename(target)
                    moved += 1
        print(f"archived={moved}")
        return 0
    except OSError as error:
        print(f"archive error: {type(error).__name__}: {error}; archived={moved}")
        return 1
    finally:
        if acquired:
            lease.rmdir()


def self_test():
    with tempfile.TemporaryDirectory(prefix="archive-test-") as root:
        home = Path(root)
        roots = [home / ".agents/shared-memory-inbox/processed", home / ".agents/retro-inbox/done"]
        old = [r / "old.md" for r in roots]
        keep = [roots[0] / "recent.md", home / ".agents/shared-memory-inbox/pending/old.md"]
        then = time.time() - 100 * 86400
        for path in old + keep:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("x\n")
        for path in old + keep[1:]:
            os.utime(path, (then, then))
        assert archive(home) == 0 and all(p.is_file() for p in old)
        assert archive(home, True) == 0
        assert not any(p.exists() for p in old) and all(p.is_file() for p in keep)
        assert all(len(list(r.glob("archive/*/old.md"))) == 1 for r in roots)
        assert not (home / ".agents/shared-memory-inbox/.curator.lock").exists()
        old[0].write_text("x\n")
        os.utime(old[0], (then, then))
        assert archive(home, True) == 1 and old[0].is_file()
    print("self-test ok")
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--as", dest="actor", choices=["codex"])
    parser.add_argument("--apply", action="store_true", help="Move files; default only prints the plan")
    parser.add_argument("--self-test", action="store_true", help="Test with a temporary tree")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if not args.actor:
        parser.error("--as is required")
    return archive(Path.home(), args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
