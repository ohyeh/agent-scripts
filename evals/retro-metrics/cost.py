#!/usr/bin/env python3
"""每週 retro：把 metrics JSON 的 token 量換成估算 USD。
定價（claude-api skill，per MTok）：
  Opus 5（至 2026-W39）：input $5 / output $25 / cache read 0.1x input
  Opus 5.5（2026-W40 起，查於 2026-09-24）：input $4 / output $20 / cache read $0.20
  W39（09-17→09-24）model 組成未量測，與先前各週同樣按 Opus 5 當量計（非帳單）
  cache write 兩者都用 1.25x input（5m TTL）；Opus 5.5 的倍率 skill 未列 → UNCONFIRMED
metrics 只按機器彙總、不分 model，所以整週套單一費率。
Codex 為 OpenAI 側，無定價表 → 只印 token，成本標 UNPRICED。"""
import json,sys,glob,os
# ponytail: 依週次整週套一種費率；metrics 拆 model 後改成逐 model 計價
RATES={"opus-5":(5.0,25.0,0.50),"opus-5-5":(4.0,20.0,0.20)}  # (input, output, cache read)
def rates(week): return RATES["opus-5-5" if week>="2026-W40" else "opus-5"]
assert rates("2026-W39")==RATES["opus-5"] and rates("2026-W40")==RATES["opus-5-5"]
def num(x):
    # W40 起每個數值葉節點包成 {"value": N, "method": ..., "tier": ...}；W39 以前是裸數字
    return x["value"] if isinstance(x,dict) and "value" in x else x
def usd(d,week):
    IN,OUT,READ=rates(week)
    g=lambda k: num(d.get(k,0))
    return (g("input")*IN + g("output")*OUT + g("cache_read")*READ + g("cache_create")*IN*1.25)/1e6
def self_test():
    plain={"input":1000,"output":2000,"cache_read":3000,"cache_create":4000}
    wrapped={k:{"value":v,"method":"m","tier":"t"} for k,v in plain.items()}
    assert usd(plain,"2026-W41")==usd(wrapped,"2026-W41")>0, (usd(plain,"2026-W41"),usd(wrapped,"2026-W41"))
    assert num({"value":"2026-W41","tier":"RAW"})=="2026-W41" and num(7)==7
    print("self-test OK")
def report(f):
    d=json.load(open(f)); tot=0.0; w=num(d['week']); win=d['window']
    print(f"== {w} ({num(win['start'])} → {num(win['end'])})  費率 {'Opus 5.5' if rates(w)==RATES['opus-5-5'] else 'Opus 5'}")
    turns=0
    for m,v in d["machines"].items():
        c=v.get("claude",{}); cost=usd(c,w); tot+=cost; turns+=num(c.get('turns',0))
        cx=v.get('codex',{}); cx=cx.get('with_archived') or cx
        print(f"  {m:20s} claude ${cost:8.2f}  ({num(c.get('sessions',0))} 場 / {num(c.get('turns',0))} 輪)"
              f"  codex {num(cx.get('total',0))/1e6:.0f}M UNPRICED")
    print(f"  {'合計 Claude':20s} ${tot:8.2f}   ·  每輪 ${tot/max(1,turns):.3f}")
# 只讀週次彙總檔 <YYYY>-W<NN>.json；不給參數時掃本目錄，避免吃進其他 JSON
args=sys.argv[1:]
if args==["--self-test"]: self_test(); sys.exit(0)
for f in args or sorted(glob.glob(os.path.join(os.path.dirname(__file__) or ".","[0-9][0-9][0-9][0-9]-W[0-9][0-9].json"))):
    report(f)
