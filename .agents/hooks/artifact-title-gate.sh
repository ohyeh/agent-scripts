#!/usr/bin/env bash
# PreToolUse · Artifact — publish 的 <title> 必須是「[<TAG>] [<TAG>]… <主題>」，至少一個 TAG，每個都要在白名單。
# TAG 白名單只在下面一行；新專案改這行即可。
# ponytail: 只掃 file_path 前 8KB（Artifact 也只掃這麼多找 <title>）
set -euo pipefail
IN=$(cat)
ACT=$(jq -r '.tool_input.action // "publish"' <<<"$IN")
[ "$ACT" = publish ] || exit 0
F=$(jq -r '.tool_input.file_path // empty' <<<"$IN")
[ -n "$F" ] && [ -f "$F" ] || exit 0
T=$(head -c 8192 "$F" | grep -o '<title>[^<]*</title>' | head -1 | sed 's/<[^>]*>//g')
TAGS='agent-scripts|healthgo|parking|ttpush|trading|ohyeh'
grep -Eq "^(\[($TAGS)\] )+[^[].+" <<<"$T" && exit 0
echo "BLOCKED: artifact <title> 須為「[<TAG>] [<TAG>]… <主題>」，TAG ∈ {$TAGS}；目前：「${T:-<無 title>}」" >&2
exit 2
