#!/usr/bin/env python3
"""Layer 1 gap collector (from the W42 scratch l1.py, W43-4). Covers only faces the repo collectors do not:
Claude trigger split (USD), dispatch vs non-dispatch per turn, cache-break list with last user msg,
workflow-run agent counts, Layer 2 lists (canary, GOAL/ACCEPTANCE/REPORT, long/short, retry-dense,
relaxed turns0>1M, claim-evidence-gate blocks), Claude archives, codex classes + context window,
agy steps, cursor chats, grok CLI, Grok Bot app replicas. Read-only. Window cut by inline time.
usage: layer1-gaps.py SINCE UNTIL   (UTC, e.g. 2026-10-08T09:30:00 2026-10-15T12:30:00)
       layer1-gaps.py --self-test"""
import json, os, sys, glob, gzip, re, sqlite3, subprocess, statistics
from datetime import datetime, timezone
SELF_TEST = sys.argv[1:] == ["--self-test"]
S, U = ("2026-01-01T00:00:00",) * 2 if SELF_TEST else (sys.argv[1][:19], sys.argv[2][:19])
SMS = int(datetime.fromisoformat(S + "+00:00").timestamp() * 1000); UMS = int(datetime.fromisoformat(U + "+00:00").timestamp() * 1000)
CUT = SMS / 1000
H = os.path.expanduser("~")
HK = re.sub(r"[^A-Za-z0-9]", "-", H)
def mask(p): return p.replace(H, "~").replace(HK, "<home>")
def inwin(ts): return S <= (ts or "")[:19] < U
RATE = (4.0, 20.0, 0.20)  # Opus 5.5 per MTok, same formula as cost.py
def usd(u): return (u[0] * RATE[0] + u[3] * RATE[1] + u[2] * RATE[2] + u[1] * RATE[0] * 1.25) / 1e6
DISPATCH = re.compile(r"GOAL\b.*ACCEPTANCE\b", re.S)
# tmux-agent-tools briefs (the W41 strict.py regex): sent as the first OR a later turn of a worker,
# and without GOAL/ACCEPTANCE in the pasted line; W42 counted them as human (W43-4).
TMUX_BRIEF = re.compile(r"Your task is in the file \S*/tmux-agent-tools/\S*\.md|Write final JSON to this exact path: \S*/tmux-agent-tools/")
PROBE = re.compile(r"^(Reply with just|Run the shell command|echo |say OK|Reply OK)", re.I)

def text_of(c):
    if isinstance(c, str): return c
    if isinstance(c, list): return "\n".join(b.get("text", "") for b in c if isinstance(b, dict) and b.get("type") == "text")
    return ""
def is_tool_result(c): return isinstance(c, list) and any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c)

def uclass(r, txt, first_top):
    o = r.get("origin") or {}; to = r.get("turnOrigin"); ok = o.get("kind") if isinstance(o, dict) else None
    if r.get("isCompactSummary"): return "compaction"
    if ok == "plugin": return "plugin_injection"
    if ok == "task-notification" or to == "task_notification" or txt.lstrip().startswith("<task-notification>"): return "task_notification"
    if ok == "peer" or to == "peer": return "plugin_injection"
    if to == "scheduled": return "command_loop"
    if "<command-name>" in txt: return "command_loop" if "<command-name>/loop" in txt else "command_other"
    if r.get("isMeta") or "<local-command-caveat>" in txt or txt.startswith("Stop hook feedback") or txt.startswith("Base directory for this skill"): return None
    if txt.startswith("[Request interrupted"): return None
    if r.get("entrypoint") == "sdk-cli" or to == "sdk": return "sdk"
    if TMUX_BRIEF.search(txt[:4000]) or (first_top and DISPATCH.search(txt[:4000])): return "dispatch_brief"
    return "human"

if SELF_TEST:
    later = "Your task is in the file /tmp/x/tmux-agent-tools/briefs/b1.md"
    assert uclass({}, later, False) == "dispatch_brief"
    assert uclass({}, "GOAL x\nACCEPTANCE y", True) == "dispatch_brief"
    assert uclass({}, "GOAL x\nACCEPTANCE y", False) == "human"
    assert uclass({}, "看一下做到哪了", True) == "human"
    print("self-test ok"); sys.exit(0)

def claude():
    P = H + "/.claude/projects"
    files = [f for f in glob.glob(P + "/**/*.jsonl", recursive=True) if os.path.getmtime(f) >= CUT]
    calls = {}  # mid -> dict
    sess = {}   # top sid path -> info
    cands = []; wf = {}; brk = []
    order = 0
    for f in sorted(files):
        rel = f[len(P) + 1:]; parts = rel.split("/")
        proj = parts[0]
        if len(parts) == 2: kind = "top"; top = f
        elif "/subagents/workflows/" in f: kind = "workflow"; top = os.path.join(P, proj, parts[1] + ".jsonl")
        elif "/subagents/" in f: kind = "subagent"; top = os.path.join(P, proj, parts[1] + ".jsonl")
        else: kind = "other"; top = os.path.join(P, proj, parts[1] + ".jsonl")
        cls = "subagent" if kind != "top" else None
        last_user = ""; first_call = True; turns = {}; errs = 0; trs = 0; streak = 0; maxstreak = 0
        last_asst = ""; delegs = []; first_seen_user = True; any_in = False; ids_here = set()
        try: fh = open(f, errors="replace")
        except OSError: continue
        for l in fh:
            try: r = json.loads(l)
            except ValueError: continue
            ts = r.get("timestamp") or ""; w = inwin(ts)
            m = r.get("message") or {}
            if not isinstance(m, dict): continue
            if r.get("type") == "user":
                c = m.get("content")
                if is_tool_result(c):
                    if w and kind == "top":
                        for b in c:
                            if isinstance(b, dict) and b.get("type") == "tool_result":
                                trs += 1
                                if b.get("is_error"): errs += 1; streak += 1; maxstreak = max(maxstreak, streak)
                                else: streak = 0
                    continue
                txt = text_of(c)
                if kind == "top":
                    k = uclass(r, txt, first_seen_user)
                    if k: first_seen_user = False; cls = k
                    if k and w: turns[k] = turns.get(k, 0) + 1
                if txt.strip() and not r.get("isMeta"): last_user = txt.strip()[:110].replace("\n", " ")
            elif r.get("type") == "assistant":
                t = text_of(m.get("content"))
                if w and t.strip() and kind == "top": last_asst = t
                if w and kind == "top" and isinstance(m.get("content"), list):
                    for b in m["content"]:
                        if isinstance(b, dict) and b.get("type") == "tool_use" and (b.get("name") in ("Agent", "Task") or b.get("name", "").endswith("tmux-agent__assign")):
                            inp = b.get("input") or {}
                            if inp.get("subagent_type") == "fork": continue
                            pr = inp.get("prompt") or inp.get("brief") or inp.get("task") or json.dumps(inp)
                            miss = [x for x in ("GOAL", "ACCEPTANCE", "REPORT") if x not in pr]
                            delegs.append(miss)
                            if miss: cands.append({"kind": "top", "f": f, "reason": "delegation_missing_" + "/".join(miss), "ts": ts[:19], "snippet": pr[:110].replace("\n", " ")})
                u = m.get("usage"); i = m.get("id")
                if isinstance(u, dict) and i:
                    if i in ids_here:
                        pass
                    ids_here.add(i)
                    if w:
                        any_in = True
                        vec = [u.get("input_tokens", 0) or 0, u.get("cache_creation_input_tokens", 0) or 0, u.get("cache_read_input_tokens", 0) or 0, u.get("output_tokens", 0) or 0]
                        old = calls.get(i)
                        if old is None or vec[3] > old["v"][3]:
                            order += 1
                            calls[i] = {"v": vec, "f": f, "top": top, "kind": kind, "cls": cls or "human", "ts": ts[:19], "model": m.get("model"), "first": first_call if old is None else old["first"], "last_user": last_user, "proj": proj}
                    first_call = False
        fh.close()
        if kind == "top":
            s = sess.setdefault(top, {"proj": proj})
            s.update(turns=turns, errs=errs, trs=trs, maxstreak=maxstreak, last_asst=last_asst, delegs=len(delegs), in_window=any_in or bool(turns))
            s["first_cls"] = next(iter(turns), None)
        if kind == "workflow":
            run = parts[1] + "/" + "/".join(parts[4:5])
            wf.setdefault(run, {"files": set(), "tokens": 0, "proj": proj})
            wf[run]["files"].add(f)
    # aggregate calls
    tot = [0, 0, 0, 0]; trig = {}; models = {}; kinds = {}
    for i, c in calls.items():
        v = c["v"]; tot = [a + b for a, b in zip(tot, v)]
        k = c["cls"] if c["kind"] == "top" else "subagent"
        t = trig.setdefault(k, {"calls": 0, "tokens": 0, "usd": 0.0}); t["calls"] += 1; t["tokens"] += sum(v); t["usd"] += usd(v)
        models[c["model"]] = models.get(c["model"], 0) + 1
        kk = kinds.setdefault(c["kind"], [0, 0]); kk[0] += 1; kk[1] += sum(v)
        s = sess.setdefault(c["top"], {"proj": c["proj"], "turns": {}, "in_window": True})
        s["tok"] = s.get("tok", 0) + sum(v); s["calls_all"] = s.get("calls_all", 0) + 1
        if c["kind"] == "top": s["calls_own"] = s.get("calls_own", 0) + 1
        else: s["child_tok"] = s.get("child_tok", 0) + sum(v); s["children"] = s.get("children", set()) | {c["f"]}
        if c["kind"] == "workflow":
            for run, w in wf.items():
                if c["f"] in w["files"]: w["tokens"] += sum(v); w.setdefault("live", set()).add(c["f"]); w["top"] = c["top"]
        unc = v[0] + v[1]
        if unc > 100_000 and not c["first"]:
            brk.append({"ts": c["ts"], "path": mask(c["f"]), "kind": c["kind"], "cls": k, "uncached": unc, "total": sum(v), "last_user": c["last_user"]})
    brk.sort(key=lambda x: x["ts"])
    # sessions
    tops = {p: s for p, s in sess.items() if s.get("in_window") and os.path.exists(p)}
    inter = [s.get("tok", 0) for s in tops.values() if s.get("turns", {}).get("human")]
    p95 = sorted(inter)[int(0.95 * (len(inter) - 1))] if inter else None
    disp = {"dispatch": [0, 0, 0], "non_dispatch": [0, 0, 0]}  # sessions, tokens, human turns
    rel0 = []; loopmed = []
    for p, s in tops.items():
        h = s.get("turns", {}).get("human", 0); tok = s.get("tok", 0)
        g = "dispatch" if (s.get("children") or s.get("delegs")) else "non_dispatch"
        if h: d = disp[g]; d[0] += 1; d[1] += tok; d[2] += h
        if h == 0 and tok > 1_000_000: rel0.append({"path": mask(p), "total": tok, "turn_classes": s.get("turns")})
        if s.get("turns", {}).get("command_loop"): pass
        if h >= 1 and p95 and tok >= p95: cands.append({"kind": "top", "f": p, "reason": "abnormally_long", "ts": "", "snippet": f"total {tok} >= interactive p95 {p95}"})
        if h >= 1 and s.get("calls_own", 0) <= 2: cands.append({"kind": "top", "f": p, "reason": "abnormally_short", "ts": "", "snippet": f"human turns {h}, api calls {s.get('calls_own', 0)}"})
        if s.get("maxstreak", 0) >= 4 or (s.get("errs", 0) >= 25 and s["errs"] >= 0.2 * max(1, s.get("trs", 0))):
            cands.append({"kind": "top", "f": p, "reason": "retry_dense", "ts": "", "snippet": f"errors {s.get('errs')}/{s.get('trs')} tool results, max consecutive {s.get('maxstreak')}"})
        if h >= 3:
            la = s.get("last_asst", "")
            if "✈" not in la[-400:] and "VERDICT:" not in la[-400:]:
                cands.append({"kind": "top", "f": p, "reason": "missing_canary", "ts": "", "snippet": la[-110:].replace("\n", " ")})
        if h == 0 and tok > 1_000_000 and not any(s.get("turns", {}).values()):
            cands.append({"kind": "top", "f": p, "reason": "turns0_over_1M", "ts": "", "snippet": f"total {tok}"})
    # /loop ctx median per session
    per = {}
    for c in calls.values():
        if c["kind"] == "top" and c["cls"] == "command_loop": per.setdefault(c["top"], []).append(c["v"][0] + c["v"][1] + c["v"][2])
    meds = sorted(statistics.median(v) for v in per.values())
    cbc = {}
    for b in brk: cbc[b["path"].split("/")[3] if b["path"].count("/") > 3 else "?"] = cbc.get(b["path"].split("/")[3] if b["path"].count("/") > 3 else "?", 0) + 1
    classes = {}
    for s in tops.values():
        for k, n in s.get("turns", {}).items(): classes[k] = classes.get(k, 0) + n
    sbc = {}
    for s in tops.values():
        fc = s.get("first_cls") or "none"
        g = "interactive" if fc in ("human", "command_other", "command_loop") else fc
        sbc[g] = sbc.get(g, 0) + 1
    wfo = []
    for run, w in sorted(wf.items()):
        live = w.get("live", set())
        if live:
            meta = {}
            for mf in glob.glob(P + "/*/" + run.replace("/", "/workflows/") + ".json"):
                try: meta = json.load(open(mf)); break
                except Exception: pass
            wfo.append({"run": mask(run), "proj": w["proj"].replace(HK, "<home>"), "agents": len(live), "tokens": w["tokens"], "parent": mask(w.get("top", "")),
                        "workflow": meta.get("workflowName"), "agentCount_meta": meta.get("agentCount"), "status": meta.get("status"), "totalTokens_meta": meta.get("totalTokens"), "durationMs": meta.get("durationMs"), "started": meta.get("timestamp")})
    for c in cands: c["path"] = mask(c.pop("f"))
    return {"files_scanned": len(files), "calls_midkey": len(calls), "tokens": dict(zip(("input", "cache_create", "cache_read", "output"), tot)), "total": sum(tot),
            "by_kind": kinds, "trigger": {k: {**v, "usd": round(v["usd"], 2)} for k, v in sorted(trig.items())}, "usd_total": round(sum(v["usd"] for v in trig.values()), 2),
            "models": models, "sessions_top": len(tops), "sessions_by_first_class": sbc, "turn_classes": classes,
            "interactive_p95": p95, "dispatch_vs_non": {k: {"sessions": v[0], "tokens": v[1], "human_turns": v[2], "tokens_per_human_turn": round(v[1] / v[2]) if v[2] else None} for k, v in disp.items()},
            "cache_breaks": brk, "cache_breaks_loop_related": sum(1 for b in brk if b["cls"] == "command_loop"),
            "loop_sessions": len(per), "loop_ctx_session_medians": meds, "loop_ctx_median_of_medians": statistics.median(meds) if meds else None,
            "relaxed_human0_over_1M": rel0, "workflow_runs": wfo, "candidates": cands,
            "subagent_files": sum(1 for c in set(x["f"] for x in calls.values() if x["kind"] == "subagent")), "workflow_files": len(set(x["f"] for x in calls.values() if x["kind"] == "workflow"))}

def archives():
    out = {}
    for name, pats in (("projects_archived_gz", ["/.claude/projects_archived/**/*.jsonl.gz"]), ("projects_archived_plain", ["/.claude/projects_archived/**/*.jsonl"]), ("transcripts_ses", ["/.claude/transcripts/ses_*.jsonl"])):
        fs = [f for p in pats for f in glob.glob(H + p, recursive=True)]
        o = {"files": len(fs), "timestamped_lines_all_time": 0, "newest": None, "in_window_lines": 0, "sessions_in_window": 0, "tokens_in_window_naive": 0, "unreadable_files": 0}
        for f in fs:
            hit = False
            try:
                with (gzip.open(f, "rt", errors="replace") if f.endswith(".gz") else open(f, errors="replace")) as fh:
                    for l in fh:
                        mm = re.search(r'"timestamp":"([0-9T:\-\.]+)', l)
                        if not mm: continue
                        ts = mm.group(1)[:19]; o["timestamped_lines_all_time"] += 1
                        if not o["newest"] or ts > o["newest"]: o["newest"] = ts
                        if S <= ts < U:
                            o["in_window_lines"] += 1; hit = True
                            if '"usage"' in l:
                                try: u = json.loads(l)["message"]["usage"]; o["tokens_in_window_naive"] += sum((u.get(k) or 0) for k in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"))
                                except Exception: pass
            except Exception: o["unreadable_files"] += 1
            o["sessions_in_window"] += hit
        out[name] = o
    return out

def codex():
    C = H + "/.codex"
    fs = [f for f in glob.glob(C + "/sessions/**/*.jsonl", recursive=True) + glob.glob(C + "/archived_sessions/*.jsonl") + glob.glob(C + "/archived_sessions/*.jsonl.zst")]
    allz = sum(1 for f in fs if f.endswith(".zst"))
    fs = [f for f in fs if os.path.getmtime(f) >= CUT]
    seen = {}; cw = {}; cls = {}
    for f in fs:
        try:
            if f.endswith(".zst"): lines = subprocess.run(["zstd", "-dcq", f], capture_output=True, text=True, errors="replace").stdout.splitlines()
            else: lines = open(f, errors="replace").read().splitlines()
        except Exception: continue
        sid = None; before = None; last = None; first_txt = None; turns = 0
        for l in lines:
            try: r = json.loads(l)
            except ValueError: continue
            p = r.get("payload") or {}; ts = (r.get("timestamp") or "")[:19]
            if r.get("type") == "session_meta": sid = sid or p.get("id")
            if p.get("type") == "token_count" and isinstance(p.get("info"), dict):
                t = p["info"].get("total_token_usage", {}).get("total_tokens", 0)
                if ts < S: before = t
                elif ts < U:
                    last = t; w = p["info"].get("model_context_window"); cw[w] = cw.get(w, 0) + 1
            if r.get("type") == "response_item" and p.get("role") == "user" and S <= ts < U:
                t = text_of(p.get("content")) or " ".join(b.get("text", "") for b in (p.get("content") or []) if isinstance(b, dict))
                if "<environment_context>" in t or "AGENTS.md" in t[:200]: continue
                turns += 1; first_txt = first_txt or t
        if last is None and not turns: continue
        k = "dispatch" if first_txt and (DISPATCH.search(first_txt) or "tmux-agent" in first_txt[:300]) else "probe" if first_txt and PROBE.search(first_txt.strip()) else "other"
        d = (last or 0) - (before or 0)
        key = sid or f
        if key in seen and seen[key][0] >= d: continue
        seen[key] = (d, k, turns, f)
    for d, k, turns, f in seen.values():
        c = cls.setdefault(k, {"rollouts": 0, "tokens": 0, "turns": 0}); c["rollouts"] += 1; c["tokens"] += d; c["turns"] += turns
        c["archived"] = c.get("archived", 0) + ("/archived_sessions/" in f)
    for c in cls.values(): c["tokens_per_turn"] = round(c["tokens"] / c["turns"]) if c["turns"] else None
    return {"rollouts": len(seen), "zst_files_all": allz, "by_class": cls, "model_context_window": {str(k): v for k, v in cw.items()},
            "turns0_over_1M": sum(1 for d, k, t, f in seen.values() if t == 0 and d > 1_000_000)}

def pbts(b):
    """protobuf: field 1 (len) -> its field 1 varint seconds."""
    def varint(b, i):
        n = s = 0
        while i < len(b):
            x = b[i]; i += 1; n |= (x & 0x7f) << s; s += 7
            if not x & 0x80: return n, i
        return n, i
    i = 0
    while i < len(b):
        key, i = varint(b, i); fn, wt = key >> 3, key & 7
        if wt == 0: _, i = varint(b, i)
        elif wt == 2:
            ln, i = varint(b, i); sub = b[i:i + ln]; i += ln
            if fn == 1 and sub[:1] == b"\x08": return varint(sub, 1)[0]
        elif wt == 1: i += 8
        elif wt == 5: i += 4
        else: return None
    return None

def agy():
    fs = glob.glob(H + "/.gemini/antigravity-cli/conversations/*.db")
    o = {"dbs_total": len(fs), "dbs_in_window": 0, "steps_in_window": 0, "unreadable": 0, "by_class": {}, "newest": None}
    for f in fs:
        try:
            con = sqlite3.connect("file:" + f + "?mode=ro", uri=True)
            rows = con.execute("select step_type, metadata, step_payload from steps").fetchall(); con.close()
        except Exception: o["unreadable"] += 1; continue
        n = 0; k = "other"
        for st, md, pl in rows:
            sec = pbts(md or b"")
            if sec is None: continue
            if not o["newest"] or sec > o["newest"]: o["newest"] = sec
            if SMS / 1000 <= sec < UMS / 1000: n += 1
            if st == 14 and pl and k == "other":
                t = bytes(pl).decode("utf-8", "replace")
                if DISPATCH.search(t): k = "dispatch"
        if n:
            o["dbs_in_window"] += 1; o["steps_in_window"] += n
            c = o["by_class"].setdefault(k, [0, 0]); c[0] += 1; c[1] += n
    if o["newest"]: o["newest"] = datetime.fromtimestamp(o["newest"], timezone.utc).isoformat()[:19]
    return o

def cursor():
    ds = glob.glob(H + "/.cursor/chats/*/*/")
    o = {"chats_total": len(ds), "chats_in_window": 0, "without_meta": 0, "role_blobs_in_window_chats": 0, "unreadable": 0}
    for d in ds:
        t = None
        try: t = json.load(open(d + "meta.json")).get("updatedAtMs")
        except Exception: pass
        if t is None:
            try: t = os.path.getmtime(d + "store.db") * 1000; o["without_meta"] += 1
            except OSError: continue
        if SMS <= t < UMS:
            o["chats_in_window"] += 1
            try:
                con = sqlite3.connect("file:" + d + "store.db?mode=ro", uri=True)
                o["role_blobs_in_window_chats"] += con.execute("select count(*) from blobs where cast(data as text) like '{\"role\":%'").fetchone()[0]; con.close()
            except Exception: o["unreadable"] += 1
    return o

def grokcli():
    fs = glob.glob(H + "/.grok/sessions/**/events.jsonl", recursive=True)
    o = {"present": os.path.isdir(H + "/.grok"), "files": len(fs), "sessions_in_window": 0, "events_in_window": 0, "events_all": 0, "newest": None}
    for f in fs:
        n = 0
        for l in open(f, errors="replace"):
            mm = re.search(r'"ts":"?([0-9T:\-\.]+)', l)
            if not mm: continue
            ts = mm.group(1)[:19]; o["events_all"] += 1
            if not o["newest"] or ts > o["newest"]: o["newest"] = ts
            if S <= ts < U: n += 1
        o["events_in_window"] += n; o["sessions_in_window"] += bool(n)
    return o

def grokapp():
    D = H + "/Library/Application Support/Grok Bot/sand-client-persistence/"
    fs = glob.glob(D + "*.transcript.replicas.*") + glob.glob(D + "*.blob")  # W42: replicas moved to base32-named .blob files
    o = {"replicas": len(fs), "replicas_in_window": 0, "entries_in_window": 0}
    for f in fs:
        try: ms = [int(x) for x in re.findall(r'"timestampMs":(\d+)', open(f, errors="replace").read())]
        except Exception: continue
        n = sum(1 for x in ms if SMS <= x < UMS); o["entries_in_window"] += n; o["replicas_in_window"] += bool(n)
    return o

def gate():
    f = H + "/.local/share/agent-hooks/claim-evidence-stats.jsonl"
    if not os.path.exists(f): return {"present": False}
    tot = win = blk = 0; sids = {}
    for l in open(f, errors="replace"):
        try: r = json.loads(l)
        except ValueError: continue
        tot += 1
        if inwin(r.get("timestamp")):
            win += 1
            if r.get("blocked") is True: blk += 1; sids[r.get("session") or "?"] = sids.get(r.get("session") or "?", 0) + 1
    return {"present": True, "rows_all": tot, "rows_window": win, "blocked_window": blk, "blocked_sessions": sids}

out = {"since": S, "until": U, "claude": claude(), "archives": archives(), "codex": codex(), "agy": agy(), "cursor": cursor(), "grok_cli": grokcli(), "grok_app": grokapp(), "gate": gate()}
print(json.dumps(out, ensure_ascii=False, default=lambda x: sorted(x) if isinstance(x, set) else str(x)))
