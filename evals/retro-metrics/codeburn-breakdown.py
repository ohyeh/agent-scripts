#!/usr/bin/env python3
"""CodeBurn export → dashboard `breakdown` rows (活動、模型、CLI、專案 in USD; 工具、MCP、shell in calls).

用法：
  codeburn --timezone UTC export -f json --from <since-date> --to <until-date> -o <export.json>
  python3 codeburn-breakdown.py <export.json> --host <host-key> --week W43 --since ISO --until ISO
  python3 codeburn-breakdown.py --self-test

Records are cut to [since, until) by timestamp. Tools, MCP and shell exist only as totals for the
export's date range, so their rows carry `basis: "<from>..<to> dates"`, not the window.
CodeBurn prices each call by its own model, so its USD is not the Opus 5.5 equivalent from cost.py.
"""
import argparse, json, os, sys
from collections import defaultdict


def rows_of(d, host, week, lo, hi, top=12):
    assert d.get("schema") == "codeburn.export.v2", d.get("schema")
    recs = [r for r in d["records"] if lo <= r["timestamp"][:19] < hi]
    rows = []

    def add(dim, key, usd, calls, basis):
        rows.append({"week": week, "host": host, "dim": dim, "key": key, "usd": round(usd, 2), "calls": calls, "basis": basis})

    for dim, f in (("activity", "category"), ("model", "model"), ("provider", "provider"), ("project", "project")):
        agg = defaultdict(lambda: [0.0, 0])
        for r in recs:
            k = r.get(f) or "unknown"
            if dim == "project":
                k = os.path.basename(k.rstrip("/")) or k
            agg[k][0] += r["cost"]; agg[k][1] += 1
        for k, (c, n) in sorted(agg.items(), key=lambda x: -x[1][0])[:top]:
            add(dim, k, c, n, "window")
    dates = f"{lo[:10]}..{hi[:10]} dates"
    for dim, lst, kf in (("tool", "tools", "Tool"), ("mcp", "mcp", "Server"), ("shell", "shellCommands", "Command")):
        for r in sorted(d.get(lst, []), key=lambda x: -x["Calls"])[:top]:
            add(dim, r[kf], 0, r["Calls"], dates)
    add("total", "all", sum(r["cost"] for r in recs), len(recs), "window")
    return rows


def self_test():
    d = {"schema": "codeburn.export.v2", "records": [
        {"timestamp": "2026-10-08T09:29:59Z", "cost": 9, "category": "coding", "model": "m", "provider": "p", "project": "/a/x"},
        {"timestamp": "2026-10-08T09:30:00Z", "cost": 2, "category": "coding", "model": "m", "provider": "p", "project": "/a/x/"},
        {"timestamp": "2026-10-15T12:30:00Z", "cost": 9, "category": "coding", "model": "m", "provider": "p", "project": "/a/x"}],
        "tools": [{"Tool": "Bash", "Calls": 3}], "mcp": [], "shellCommands": [{"Command": "rg", "Calls": 1}]}
    r = rows_of(d, "h", "W42", "2026-10-08T09:30:00", "2026-10-15T12:30:00")
    tot = [x for x in r if x["dim"] == "total"][0]
    assert (tot["usd"], tot["calls"]) == (2, 1), tot  # both window edges: since inclusive, until exclusive
    assert [x["key"] for x in r if x["dim"] == "project"] == ["x"], r
    assert [x for x in r if x["dim"] == "shell"][0]["basis"] == "2026-10-08..2026-10-15 dates"
    print("self-test ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("export", nargs="?"); ap.add_argument("--host"); ap.add_argument("--week")
    ap.add_argument("--since"); ap.add_argument("--until"); ap.add_argument("--self-test", action="store_true")
    a = ap.parse_args()
    if a.self_test:
        self_test(); raise SystemExit
    if not all([a.export, a.host, a.week, a.since, a.until]):
        ap.error("export, --host, --week, --since and --until are required")
    norm = lambda s: s.replace("Z", "")[:19]
    print(json.dumps(rows_of(json.load(open(a.export)), a.host, a.week, norm(a.since), norm(a.until)), ensure_ascii=False))
