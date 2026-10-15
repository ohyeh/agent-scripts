#!/usr/bin/env python3
"""Grok Bot busy-ness on grok-bot-vm: messages and kchars per bot, this window and the 3 weeks before.

Not USD: the store has no token field. The real cost is only on the app's Usage page.
Read-only. Run on grok-bot-vm via stdin; write nothing there:
  ssh <grok-bot-vm> 'HOME=<service-home> python3 - --since A --until B' < grok-bot-busy.py > busy.json
  python3 grok-bot-busy.py --self-test
Output: {"bots": [{id, bot, "W0:n", "W0:kc", "W-1:n", ...}] sorted by this window's kchars,
         "cli_logs": {"W0": n, ...}} = files in /workspace/coding-cli-logs per week, by the date
         at the start of the file name (mtime is the 10-08 copy date); "undated" = no date in the name.
W0 = [since, until); W-k = the 7 days ending k-1 weeks before since.
"""
import argparse, glob, json, os, re, sqlite3, collections
from datetime import datetime, timezone

B = os.path.expanduser("~/sand-data")  # agent-data is a stale copy; search-index.db is live
LOGS = "/workspace/coding-cli-logs"  # what the coding-cli proxy bot ran
WK = 7 * 86400000


def ms(s):
    d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    return int((d if d.tzinfo else d.replace(tzinfo=timezone.utc)).timestamp() * 1000)


def weeks(lo, hi):
    return {"W0": (lo, hi), **{f"W-{i}": (lo - i * WK, lo - (i - 1) * WK) for i in range(1, 4)}}


def busy(db, names, lo, hi):
    agg = collections.defaultdict(collections.Counter)
    for w, (a, b) in weeks(lo, hi).items():
        for aid, n, ch in db.execute("select agent_id, count(*), sum(length(body)) from messages "
                                     "where timestamp_ms>=? and timestamp_ms<? group by agent_id", (a, b)):
            agg[aid][w + ":n"] += n; agg[aid][w + ":kc"] += round((ch or 0) / 1000)
    out = [{"id": a[:8], "bot": names.get(a, "unknown"), **dict(sorted(v.items()))} for a, v in agg.items()]
    return sorted(out, key=lambda r: -r.get("W0:kc", 0))


def cli_logs(names, lo, hi):
    c = collections.Counter({w: 0 for w in weeks(lo, hi)})
    for f in names:
        m = re.match(r"(\d{4})(\d{2})(\d{2})", f)
        if not m: c["undated"] += 1; continue
        t = ms("-".join(m.groups()) + "T00:00:00Z")
        # a file name has a day, not a time: count the day of `since` in W0
        w = next((w for w, (a, b) in weeks(lo, hi).items() if a - 86400000 < t < b), None)
        c[w or "other"] += 1
    return dict(c)


def self_test():
    db = sqlite3.connect(":memory:")
    db.execute("create table messages(agent_id, role, timestamp_ms, body)")
    lo, hi = ms("2026-10-08T09:30:00Z"), ms("2026-10-15T12:30:00Z")
    db.executemany("insert into messages values(?,?,?,?)", [
        ("a", "user", lo, "x" * 1500), ("a", "user", hi, "late"), ("a", "user", lo - 1, "w-1"),
        ("b", "user", lo - WK, "w-1 start"), ("b", "user", lo - WK - 1, "w-2")])
    r = {x["id"]: x for x in busy(db, {"a": "A"}, lo, hi)}
    assert r["a"]["W0:n"] == 1 and r["a"]["W0:kc"] == 2 and r["a"]["W-1:n"] == 1, r  # until is exclusive
    assert r["b"]["W-1:n"] == 1 and r["b"]["W-2:n"] == 1 and r["b"]["bot"] == "unknown", r
    lg = cli_logs(["20261008-a.log", "20261007-b.log", "x.log", "20260101-c.log"], lo, hi)
    assert (lg["W0"], lg["W-1"], lg["undated"], lg["other"]) == (1, 1, 1, 1), lg
    print("self-test ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--since"); ap.add_argument("--until"); ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        self_test(); raise SystemExit
    if not (a.since and a.until):
        ap.error("--since and --until are required")
    names = {}
    for p in glob.glob(f"{B}/agents/*/profile.json"):
        try: names[p.split("/")[-2]] = json.load(open(p)).get("name") or "?"
        except (OSError, ValueError) as e: names[p.split("/")[-2]] = f"?({type(e).__name__})"
    db = sqlite3.connect(f"file:{B}/search-index.db?mode=ro", uri=True)
    lo, hi = ms(a.since), ms(a.until)
    logs = [f for _, _, fs in os.walk(LOGS) for f in fs]
    print(json.dumps({"bots": busy(db, names, lo, hi), "cli_logs": cli_logs(logs, lo, hi)}, ensure_ascii=False))
