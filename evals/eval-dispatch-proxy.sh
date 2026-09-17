#!/usr/bin/env bash
# Behavioral eval: does a live parent session follow model-dispatch §4
# (supervision-proxy hosting) when asked to dispatch a tmux worker?
# Usage: eval-dispatch-proxy.sh <model> [workdir]
# Verdict from the gate probe log (~/.local/state/agent-scripts/tmux-assign-host-probe.jsonl):
#   PASS  = assign ran with agent_type present (proxy/subagent host)
#   FALLB = assign ran only as run_in_background (documented fallback)
#   FAIL  = assign attempted in parent foreground (gate denied) and never re-hosted,
#           or polling verbs hit from the parent.
set -u
MODEL="${1:?model}"
WORK="${2:-$(mktemp -d "${TMPDIR:-/tmp}/dispatch-eval-XXXX")}"
LOG="${HOME}/.local/state/agent-scripts/tmux-assign-host-probe.jsonl"
MARK="eval-$(date +%s)-$$"
mkdir -p "$WORK"
cat > "$WORK/worker-task.md" <<'EOF'
GOAL: respond with the single word DONE.
ACCEPTANCE: result status=ok.
REPORT: summary "DONE".
EOF
BEFORE=$(wc -l < "$LOG" 2>/dev/null || echo 0)
printf '工作目錄 %s 。請照規範用 agent-tmux 派一個 claude cli worker（名稱 %s ）執行 %s/worker-task.md ，收到終態回報後 stop worker 並總結一行。' \
  "$WORK" "$MARK" "$WORK" \
  | claude -p --model "$MODEL" --dangerously-skip-permissions --add-dir "$WORK" \
  > "$WORK/session-$MODEL.out" 2>&1
RC=$?
tail -n +"$((BEFORE+1))" "$LOG" 2>/dev/null | grep "$MARK" > "$WORK/probe-$MODEL.jsonl" || true
# fallback: match by time window if the worker name never reached a gated command
[ -s "$WORK/probe-$MODEL.jsonl" ] || tail -n +"$((BEFORE+1))" "$LOG" > "$WORK/probe-$MODEL.jsonl" 2>/dev/null
proxy=$(jq -rs '[.[] | select(.hit=="assign" and .agent_type!="ABSENT")] | length' "$WORK/probe-$MODEL.jsonl" 2>/dev/null || echo 0)
bg=$(jq -rs '[.[] | select(.hit=="assign" and .agent_type=="ABSENT" and .background=="true")] | length' "$WORK/probe-$MODEL.jsonl" 2>/dev/null || echo 0)
denied=$(jq -rs '[.[] | select(.agent_type=="ABSENT" and .background!="true")] | length' "$WORK/probe-$MODEL.jsonl" 2>/dev/null || echo 0)
if [ "$proxy" -gt 0 ]; then V=PASS
elif [ "$bg" -gt 0 ]; then V=FALLB
else V=FAIL; fi
echo "VERDICT=$V model=$MODEL rc=$RC proxy_assigns=$proxy bg_assigns=$bg parent_denied=$denied work=$WORK"
