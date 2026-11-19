#!/usr/bin/env python3
"""Grok Bot agents (search-index.db, ?mode=ro): class split, grok-bot-store.py rules 1-4 (mechanical) and
W41 correction-keyword candidates on the rows left. Read-only (from the W42 scratch gbx.py, W43-4).
usage: grok-bot-classes.py SINCE_MS UNTIL_MS   (runs where ~/sand-data exists: grok-bot-vm)"""
import sqlite3, json, os, re, sys, glob
from datetime import datetime, timezone
S, U = int(sys.argv[1]), int(sys.argv[2])
H = os.path.expanduser("~")
CORR = re.compile(r"不對|不是|我說的是|你改壞|改壞|別再|又錯|錯了|搞錯|重來|不要這樣|沒聽懂|我是說|你沒有|誰叫你|根本")
ROUTINE = re.compile(r"\[routine\]|SAND_")
cls = {}
for p in glob.glob(H + "/sand-data/agents/*/profile.json"):
    try: cls[p.split("/")[-2]] = (json.load(open(p)).get("harness") or "none")
    except Exception: pass
con = sqlite3.connect("file:" + H + "/sand-data/search-index.db?mode=ro", uri=True)
rows = con.execute("select agent_id, entry_id, role, timestamp_ms, body from messages where timestamp_ms >= ? and timestamp_ms < ? order by timestamp_ms", (S, U)).fetchall()
newest = con.execute("select max(timestamp_ms) from messages").fetchone()[0]
by = {}; rule = {"r1_session_tag": 0, "r2_relay_bracket": 0, "r3_hidden_or_agent": 0, "r4_agent_inbound": 0, "routine": 0, "left_for_rule5": 0}; cands = []
for a, e, role, ts, body in rows:
    k = "NOVA" if a.startswith("168d152a") else cls.get(a, "unknown")
    d = by.setdefault(k, {"agents": set(), "user": 0, "assistant": 0}); d["agents"].add(a); d[role] = d.get(role, 0) + 1
    if role != "user": continue
    b = (body or "").lstrip()
    if re.match(r"\[w:[0-9a-f]{8}\]", b): rule["r1_session_tag"] += 1; continue
    if b.startswith("【") or b.startswith("⟨"): rule["r2_relay_bracket"] += 1; continue
    if b.startswith("[SAND_HIDDEN_PROMPT]") or b.startswith("[agent]"): rule["r3_hidden_or_agent"] += 1; continue
    if (e or "").startswith("agent-inbound-"): rule["r4_agent_inbound"] += 1; continue
    if ROUTINE.search(b[:300]): rule["routine"] += 1; continue
    rule["left_for_rule5"] += 1
    m = CORR.search(b)
    if m: cands.append({"agent": a, "entry": e, "class": k, "ts": datetime.fromtimestamp(ts / 1000, timezone.utc).isoformat()[:19], "kw": m.group(0), "snippet": b[:110].replace("\n", " ")})
print(json.dumps({"rows": len(rows), "newest_utc": datetime.fromtimestamp(newest / 1000, timezone.utc).isoformat()[:19] if newest else None,
                  "by_class": {k: {"agents": len(v["agents"]), "user": v["user"], "assistant": v["assistant"]} for k, v in by.items()},
                  "user_rules": rule, "correction_candidates": cands}, ensure_ascii=False))
