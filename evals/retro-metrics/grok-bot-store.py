#!/usr/bin/env python3
"""Grok Bot (sand) agents message store: count rows in a time window.

Store: `<service-home>/sand-data/search-index.db`, table
`messages(agent_id, entry_id, role, timestamp_ms, body, seq)`; role is
`user` or `assistant`. It lives on grok-bot-vm, not in the desktop app's
Application Support dir. Run it there the W41 way: script on stdin, no file
left, HOME set to the service home, e.g.
    ssh <grok-bot-vm> "HOME=<service-home> bash -l -c 'python3 - --since A --until B'" < grok-bot-store.py

Fields: agent = agent_id, role = role, timestamp = timestamp_ms (UTC ms).
Window: since <= timestamp_ms < until, per row by inline time (never mtime).
Method = W41 `count(*) ... where timestamp_ms in window group by agent_id, role`
(`2026-W41/coverage-grok-bot-vm.md:24`, `2026-W41/human-signal.md:99`).
The db is opened read-only (`?mode=ro`, which sees WAL frames); never written.

role=user is NOT "human". The index has no sender field (no clientNonce /
fromAgent), so a role=user row may be a bot relay or a Claude/Codex session.

Human rule (真人判準) for the W41 count of 479 human turns. This is a MANUAL
judgment that a person made by reading rows. This script does NOT compute it
(`2026-W41/human-signal.md:101-108`). Rules in order, on role=user rows:
  1. body starts with `[w:<sid8>]` -> exclude (Claude/Codex session message).
  2. body starts with `【…】` or `⟨…⟩` -> exclude (bot-to-bot relay).
  3. `[SAND_HIDDEN_PROMPT]` system prompt, `[agent]` bot-to-bot -> exclude.
  4. entry_id starts with `agent-inbound-` -> exclude (cursor cloud agent result).
  5. Read each remaining row; exclude bot-sent content ("Paul 要…" relays,
     `#任務 交辦｜` / `#任務 結果｜`, `## cursor-agent LOG`, "The call ended.",
     long briefs to another bot). Keep short human replies (e.g. 「合」).
Rules 1-4 are mechanical; rule 5 is not. Thus no number this script prints is
a human count.
"""
import argparse
import os
import sqlite3
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_DB = Path.home() / "sand-data" / "search-index.db"


def to_ms(value):
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def count(db, since_ms, until_ms):
    """Return {(agent_id, role): rows} for since_ms <= timestamp_ms < until_ms."""
    # shortcut: no temp-copy fallback for a WAL db without -shm in a read-only dir; it fails loudly here, add one if that happens.
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    try:
        rows = con.execute(
            "select agent_id, role, count(*) from messages"
            " where timestamp_ms >= ? and timestamp_ms < ? group by agent_id, role",
            (since_ms, until_ms),
        ).fetchall()
    finally:
        con.close()
    return {(agent, role): n for agent, role, n in rows}


def report(counts):
    roles = {}
    agents = {}
    for (agent, role), n in counts.items():
        roles[role] = roles.get(role, 0) + n
        agents.setdefault(role, set()).add(agent)
    for role in sorted(roles):
        print(f"role={role} rows={roles[role]} agents={len(agents[role])}")
    print(f"agents active (any role): {len({a for a, _ in counts})}")


def self_test():
    with tempfile.TemporaryDirectory() as tmp:
        db = os.path.join(tmp, "search-index.db")
        con = sqlite3.connect(db)
        con.execute("create table messages(agent_id, entry_id, role, timestamp_ms, body, seq)")
        since, until = to_ms("2026-10-01T12:00:00Z"), to_ms("2026-10-08T09:30:00Z")
        con.executemany(
            "insert into messages values(?, ?, ?, ?, '', 0)",
            [
                ("a", "e1", "user", since - 1),       # before window
                ("a", "e2", "user", since),           # since is inclusive
                ("a", "e3", "assistant", since + 5),
                ("b", "e4", "user", until - 1),
                ("b", "e5", "user", until),           # until is exclusive
            ],
        )
        con.commit()
        con.close()
        got = count(db, since, until)
        assert got == {("a", "user"): 1, ("a", "assistant"): 1, ("b", "user"): 1}, got
        assert sum(n for (_, r), n in got.items() if r == "user") == 2
        assert to_ms("2026-10-01T20:00:00+08:00") == since
    print("self-test ok")


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--db", default=str(DEFAULT_DB))
    p.add_argument("--since", help="ISO time, inclusive; no zone = UTC (W41: 2026-10-01T12:00:00Z)")
    p.add_argument("--until", help="ISO time, exclusive; no zone = UTC (W41: 2026-10-08T09:30:00Z)")
    p.add_argument("--by-agent", action="store_true", help="also print rows per agent_id and role")
    p.add_argument("--self-test", action="store_true")
    args = p.parse_args()
    if args.self_test:
        return self_test()
    if not (args.since and args.until):
        p.error("--since and --until are required")
    if not os.path.exists(args.db):
        sys.exit(f"store-absent: {args.db}")
    counts = count(args.db, to_ms(args.since), to_ms(args.until))
    print(f"db: {args.db}  window: {args.since} <= timestamp_ms < {args.until}")
    report(counts)
    if args.by_agent:
        for (agent, role), n in sorted(counts.items()):
            print(f"{n:6d}  {role:9s}  {agent}")


if __name__ == "__main__":
    main()
