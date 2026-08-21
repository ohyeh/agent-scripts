#!/usr/bin/env python3
"""每週 retro：把 metrics JSON 的 token 量換成估算 USD。
定價（claude-api skill，cached 2026-06-24，Opus 5 $5/$25 per MTok）：
  input $5 / output $25 / cache read 0.1x input / cache write 1.25x input（5m TTL）
Codex 為 OpenAI 側，無定價表 → 只印 token，成本標 UNPRICED。"""
import json,sys,glob,os
IN,OUT=5.0,25.0; READ,WRITE=IN*0.1,IN*1.25
def usd(d):
    return (d.get("input",0)*IN + d.get("output",0)*OUT
            + d.get("cache_read",0)*READ + d.get("cache_create",0)*WRITE)/1e6
for f in sorted(glob.glob(os.path.join(os.path.dirname(__file__) or ".","*.json"))):
    d=json.load(open(f)); tot=0.0
    print(f"== {d['week']} ({d['window']['start']} → {d['window']['end']})")
    for m,v in d["machines"].items():
        c=v.get("claude",{}); cost=usd(c); tot+=cost
        print(f"  {m:20s} claude ${cost:8.2f}  ({c.get('sessions',0)} 場 / {c.get('turns',0)} 輪)"
              f"  codex {v.get('codex',{}).get('total',0)/1e6:.0f}M UNPRICED")
    print(f"  {'合計 Claude':20s} ${tot:8.2f}   ·  每輪 ${tot/max(1,sum(v.get('claude',{}).get('turns',0) for v in d['machines'].values())):.3f}")
