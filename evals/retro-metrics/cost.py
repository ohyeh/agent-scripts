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
def usd(d,week):
    IN,OUT,READ=rates(week)
    return (d.get("input",0)*IN + d.get("output",0)*OUT
            + d.get("cache_read",0)*READ + d.get("cache_create",0)*IN*1.25)/1e6
for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__) or ".","*.json"))):
    d=json.load(open(f)); tot=0.0; w=d['week']
    print(f"== {w} ({d['window']['start']} → {d['window']['end']})  費率 {'Opus 5.5' if rates(w)==RATES['opus-5-5'] else 'Opus 5'}")
    for m,v in d["machines"].items():
        c=v.get("claude",{}); cost=usd(c,w); tot+=cost
        print(f"  {m:20s} claude ${cost:8.2f}  ({c.get('sessions',0)} 場 / {c.get('turns',0)} 輪)"
              f"  codex {v.get('codex',{}).get('total',0)/1e6:.0f}M UNPRICED")
    print(f"  {'合計 Claude':20s} ${tot:8.2f}   ·  每輪 ${tot/max(1,sum(v.get('claude',{}).get('turns',0) for v in d['machines'].values())):.3f}")
