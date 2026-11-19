#!/usr/bin/env bash
# PreToolUse gate on mcp__codex-cu__js: browser calls go only to the entry that
# codex-cu-chrome-id proved is the real Google Chrome (2026-10-21: an agent drove
# the owner's Arc, which also reports name "Chrome", after the owner said many times
# to use Chrome only).
#
# Text match on the JS: a browser call (getTab, createBrowserTab, getBrowser) must
# carry the extensionInstanceId that the probe recorded, and no other literal browser
# ("iab"/"mcpapps" are in-app, allowed). Numeric ids differ per cua runtime, so they
# prove nothing. getApp on Arc or another Chromium browser is denied too. The proof
# expires after 30 minutes.
#
# MODE: DENY, exit 2.
set -u
IN="$(cat)"
[ -x /usr/bin/python3 ] || exit 0
STATE="${XDG_CONFIG_HOME:-$HOME/.config}/codex-cu/chrome-browser.json"
PROBE="~/.agents/skills/codex-cu/scripts/codex-cu-chrome-id"
STATE="$STATE" PROBE="$PROBE" /usr/bin/python3 -c '
import json, os, re, sys, time
code = (json.loads(sys.stdin.read() or "{}").get("tool_input") or {}).get("code") or ""
probe = os.environ["PROBE"]
def deny(msg):
    print("BLOCKED codex-cu-chrome-gate: " + msg, file=sys.stderr)
    sys.exit(2)
app = re.search(r"getApp\(\s*[\x27\"`]([^\x27\"`]+)", code)
if app and re.search(r"\b(arc|brave|edge|chromium|vivaldi|opera|dia)\b|company\.thebrowser", app.group(1), re.I):
    deny("getApp(" + app.group(1) + ") drives the owner\x27s own browser. Use only Google Chrome, through the browser surface.")
if not re.search(r"\b(getTab|createBrowserTab|getBrowser|nameSession)\b", code):
    sys.exit(0)
lit = r"\s*[\x27\"`]([^\x27\"`]+)[\x27\"`]"
named = re.findall(r"browser\s*:" + lit, code) + re.findall(r"createBrowserTab\(" + lit, code) \
      + re.findall(r"extensionInstanceId\s*:" + lit, code) + re.findall(r"getBrowser\(\s*\{\s*id\s*:" + lit, code)
if re.search(r"getTab\(\s*\{\s*mention", code) and not named:
    sys.exit(0)  # an @-mention the owner supplied names its own tab
inapp = {"iab", "mcpapps"}
if named and all(n in inapp for n in named):
    sys.exit(0)
try:
    rec = json.load(open(os.environ["STATE"]))
except (OSError, ValueError):
    deny("no proven Google Chrome. Run " + probe + " first.")
if time.time() - rec.get("verified_at", 0) > 1800:
    deny("the Google Chrome proof is older than 30 minutes. Run " + probe + " again.")
ext = str(rec.get("extensionInstanceId"))
# numeric ids differ per cua runtime (same Chrome was "1" in one, "2" in another), so
# only the extensionInstanceId proves the target; resolve the id in the same call
bad = [n for n in named if n not in inapp | {ext}]
if bad or ext not in code:
    deny("name Google Chrome by its proven extensionInstanceId in this same call: "
         "const cid = (await cua.getState({ emit: false })).browsers.find(x => x.metadata?.extensionInstanceId === \"" + ext + "\")?.id; then pass cid. "
         + ("Refused " + str(bad) + ": " if bad else "") + "a literal id or \"chrome\" can be Arc, which also reports name Chrome.")
' <<<"$IN"
