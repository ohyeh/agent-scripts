#!/usr/bin/env python3
"""Layer 2 素材抽取：7d 內 top-level Claude transcript，抽 (a) 使用者糾正句 + 其前一則 assistant 文字，
(b) assistant done-claim 且前 6 行無證據 token 的句子。輸出 JSON 行。正則沿用 cmli agent-sessions v4。"""
import json, os, glob, time, re, socket
cut = time.time() - 7 * 86400
CORR = re.compile(r"不對|不是這樣|我說的是|你改壞|別再|又錯|重來|不要這樣")
DONE = re.compile(r"\b(done|fixed|verified|complete[d]?|all tests pass(?:ing|ed)?|PASS)\b", re.I)
EVID = re.compile(r"(exit\s*(?:code|=)|\$\?|\bexit\s+0\b|\d+\s+(?:tests?|pass(?:ing|ed))|# tests \d|\bpass \d+\b|\d+\/\d+ pass(?:ed|es)?|\d+ passes|PASS \[|DEPLOY OK|READBACK:|VERDICT: (?:PASS|BLOCK))", re.I)
def texts(m):
    c = m.get("content")
    if isinstance(c, str): return [c]
    return [b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text"] if isinstance(c, list) else []
items = []
for f in glob.glob(os.path.expanduser("~/.claude/projects/*/*.jsonl")):
    if os.path.getmtime(f) < cut: continue
    proj = f.split("/")[-2]; sid = os.path.basename(f)[:8]
    rows = []
    with open(f, errors="replace") as fh:
        for l in fh:
            try: r = json.loads(l)
            except Exception: continue
            if r.get("type") in ("user", "assistant"): rows.append((r.get("type"), r.get("timestamp", ""), " ".join(texts(r.get("message") or {})), l))
    last_asst = ""; n_done = 0
    for i, (ty, ts, tx, raw) in enumerate(rows):
        if ty == "assistant":
            if tx.strip(): last_asst = tx
            if DONE.search(tx) and n_done < 3:
                ctx = "".join(x[3] for x in rows[max(0, i - 6):i])
                if not EVID.search(raw) and not EVID.search(ctx):
                    n_done += 1
                    m = DONE.search(tx); s = max(0, m.start() - 160)
                    items.append({"host": socket.gethostname(), "proj": proj, "sid": sid, "ts": ts[:16], "kind": "done_no_evidence", "snippet": tx[s:m.end() + 120].replace("\n", " ")})
        elif ty == "user" and tx and CORR.search(tx) and "tool_result" not in raw[:200]:
            items.append({"host": socket.gethostname(), "proj": proj, "sid": sid, "ts": ts[:16], "kind": "correction", "user": tx[:300].replace("\n", " "), "prev_assistant": last_asst[-300:].replace("\n", " ")})
print(json.dumps(items, ensure_ascii=False))
