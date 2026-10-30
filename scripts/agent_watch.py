#!/usr/bin/env python3
"""Report browser idle gaps in a Claude Code session transcript (.jsonl).

Prints one JSON line per gap of >= threshold seconds between browser tool
results, plus the gap from the last browser result to now. Other tool results
do not reset the clock: a transcript can grow while the browser sits idle.
Diagnostic only: read-only, no hook, no network.

Usage: agent_watch.py <transcript.jsonl> [--threshold SECONDS] | --self-test
"""
import argparse
import datetime
import json
import re
import sys

BROWSER_PREFIXES = ("mcp__claude-in-chrome__", "mcp__codex-cu__")


def is_browser(tool):
    name = tool.get("name", "")
    if name.startswith(BROWSER_PREFIXES):
        return True
    command = str((tool.get("input") or {}).get("command", ""))
    # the executable of a pipeline segment, not an argument (`rg agent-browser README.md` is not a browser call)
    return name == "Bash" and re.search(r"(^|[;&|(]\s*)(\S*/)?agent-browser(\s|$)", command) is not None


def parse_time(stamp):
    return datetime.datetime.fromisoformat(stamp.replace("Z", "+00:00"))


def idle_gaps(lines, threshold=240, now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    browser_ids, results = set(), []
    for line in lines:
        try:
            row = json.loads(line)
        except ValueError:
            continue
        content = (row.get("message") or {}).get("content")
        if not isinstance(content, list):
            continue
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "tool_use" and is_browser(part):
                browser_ids.add(part.get("id"))
            elif (part.get("type") == "tool_result" and row.get("timestamp")
                  and part.get("tool_use_id") in browser_ids):
                results.append(parse_time(row["timestamp"]))
    events = []
    for since, until in zip(results, results[1:] + [now]):
        seconds = int((until - since).total_seconds())
        if seconds >= threshold:
            events.append({"event": "browser_idle", "seconds": seconds, "since": since.isoformat(),
                           "until": "now" if until is now else until.isoformat()})
    return events


def self_test():
    t0 = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)

    def row(seconds, part):
        stamp = (t0 + datetime.timedelta(seconds=seconds)).isoformat().replace("+00:00", "Z")
        return json.dumps({"timestamp": stamp, "message": {"content": [part]}})

    lines = [
        row(0, {"type": "tool_use", "id": "b1", "name": "mcp__claude-in-chrome__navigate"}),
        row(1, {"type": "tool_result", "tool_use_id": "b1", "content": "ok"}),
        row(2, {"type": "tool_use", "id": "r1", "name": "Read"}),
        row(250, {"type": "tool_result", "tool_use_id": "r1", "content": "not a browser result"}),
    ]
    at = lambda seconds: t0 + datetime.timedelta(seconds=seconds)
    assert len(idle_gaps(lines, now=at(1 + 300))) == 1, "5-minute gap must emit one event"
    assert idle_gaps(lines, now=at(1 + 180)) == [], "3-minute gap must emit none"
    assert idle_gaps(lines[2:], now=at(1000)) == [], "no browser result, no event"
    bash = [row(0, {"type": "tool_use", "id": "a1", "name": "Bash", "input": {"command": "agent-browser open x"}}),
            row(1, {"type": "tool_result", "tool_use_id": "a1", "content": "ok"}),
            row(400, {"type": "tool_use", "id": "a2", "name": "mcp__codex-cu__js"}),
            row(401, {"type": "tool_result", "tool_use_id": "a2", "content": "ok"})]
    assert len(idle_gaps(bash, now=at(402))) == 1, "gap between browser results must emit one event"
    grep = lines[:2] + [row(2, {"type": "tool_use", "id": "g1", "name": "Bash", "input": {"command": "rg -n agent-browser README.md"}}),
                        row(150, {"type": "tool_result", "tool_use_id": "g1", "content": "hit"})]
    assert len(idle_gaps(grep, now=at(301))) == 1, "an agent-browser argument is not a browser call"
    print("self-test: ok")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("transcript", nargs="?")
    parser.add_argument("--threshold", type=int, default=240, help="idle seconds (default 240)")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    if not args.transcript:
        parser.error("transcript path required")
    with open(args.transcript) as f:
        for event in idle_gaps(f, args.threshold):
            print(json.dumps(event))


if __name__ == "__main__":
    sys.exit(main())
