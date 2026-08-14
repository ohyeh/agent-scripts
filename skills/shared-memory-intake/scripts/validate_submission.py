#!/usr/bin/env python3
"""Validate one shared-memory submission without third-party dependencies."""

from __future__ import annotations

import argparse
import re
import sys
import tempfile
from pathlib import Path

REQUIRED = {
    "schema_version": "1",
    "source_runtime": "claude",
    "submitted_at": None,
    "cwd": None,
    "source_session": None,
    "claim_status": "unverified",
}
SECRET_PATTERNS = (
    r"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----",
    r"(?i)\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password)\s*[:=]\s*[^\s]{8,}",
    r"\b(?:AKIA|AIza)[A-Za-z0-9_-]{16,}",
)


def frontmatter(text: str) -> dict[str, str]:
    if not text.startswith("---\n"):
        raise ValueError("missing YAML frontmatter")
    _, block, _ = text.split("---\n", 2)
    result: dict[str, str] = {}
    for line in block.splitlines():
        if not line or line.lstrip().startswith("#"):
            continue
        key, separator, value = line.partition(":")
        if not separator:
            raise ValueError(f"invalid frontmatter line: {line}")
        result[key.strip()] = value.strip()
    return result


def errors_for(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    try:
        metadata = frontmatter(text)
    except ValueError as error:
        return [str(error)]

    errors = []
    for key, expected in REQUIRED.items():
        value = metadata.get(key)
        if not value:
            errors.append(f"missing {key}")
        elif expected is not None and value != expected:
            errors.append(f"{key} must be {expected}")
    if metadata.get("cwd", "") and not metadata["cwd"].startswith("/"):
        errors.append("cwd must be absolute")
    if "evidence_host" in metadata and not metadata["evidence_host"]:
        errors.append("evidence_host must not be empty")
    for pattern in SECRET_PATTERNS:
        if re.search(pattern, text):
            errors.append("possible secret pattern detected")
            break
    return errors


def self_test() -> int:
    valid = """---\nschema_version: 1\nsource_runtime: claude\nsubmitted_at: 2026-07-26T00:00:00Z\ncwd: /repo\nsource_session: session-1\nclaim_status: unverified\nevidence_host: mbp-local\n---\n# Candidate\n"""
    cases = {
        "runtime": valid.replace("source_runtime: claude", "source_runtime: codex"),
        "missing": valid.replace("source_session: session-1\n", ""),
        "relative": valid.replace("cwd: /repo", "cwd: repo"),
        "empty_host": valid.replace("evidence_host: mbp-local", "evidence_host:"),
        "secret": valid + "api_key: abcdefgh\n",
    }
    with tempfile.TemporaryDirectory() as directory:
        good = Path(directory) / "good.md"
        good.write_text(valid, encoding="utf-8")
        assert not errors_for(good)
        for name, text in cases.items():
            candidate = Path(directory) / f"{name}.md"
            candidate.write_text(text, encoding="utf-8")
            assert errors_for(candidate)
    print("self-test: PASS")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("submission", nargs="?", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if not args.submission or not args.submission.is_file():
        parser.error("provide an existing submission file")
    errors = errors_for(args.submission)
    if errors:
        print("FAIL: " + "; ".join(errors))
        return 1
    print(f"PASS: {args.submission}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
