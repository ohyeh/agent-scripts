#!/usr/bin/env bash
# Dedicated statusline wrapper for Google Antigravity CLI (agy).
#
# Inherits the claude-hud rendering engine while maintaining complete isolation
# from Claude Code and Cursor CLI statusline configurations.
#
# - Maps Antigravity's real Google AI Pro quota (5h / weekly) to rate_limits
# - Suppresses foreign Cursor plan snapshot usage
# - Suppresses foreign Claude-only environment counts (CLAUDE.md / hooks count)
# - Displays live Git repo/branch state and Context Window usage bar
# - Displays active session ID and Ponytail badge (when enabled)
#
# Configured in: ~/.gemini/antigravity-cli/settings.json
#   "statusLine": { "type": "command", "command": "bash ~/.gemini/antigravity-cli/statusline.sh" }

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.bun/bin:${PATH}"

input=$(cat)

if [ -z "$input" ] || ! echo "$input" | jq -e . >/dev/null 2>&1; then
  input="{}"
fi

# 1. Map Antigravity's real quota to both Gemini and 3P model_scoped windows
snapshot_file="${HOME}/.gemini/antigravity-cli/statusline-usage-snapshot.json"
printf '%s' "$input" | python3 -c '
import sys, json, os, time
from datetime import datetime, timezone

out_path = os.path.expanduser("~/.gemini/antigravity-cli/statusline-usage-snapshot.json")

try:
    data = json.load(sys.stdin)
    quota = data.get("quota") or {}
    now = int(time.time())
    scoped = []

    def sort_key(k):
        if k.endswith("-5h") and len(k) > 3:
            family = k[:-3]
            win_rank = 0
        elif k.endswith("-weekly") and len(k) > 7:
            family = k[:-7]
            win_rank = 1
        else:
            family = k
            win_rank = 2

        if family == "gemini":
            fam_rank = 0
        elif family == "3p":
            fam_rank = 1
        else:
            fam_rank = 2

        return (fam_rank, family, win_rank, k)

    for k in sorted(quota.keys(), key=sort_key):
        entry = quota[k]
        if not isinstance(entry, dict) or "remaining_fraction" not in entry:
            continue
        if k.endswith("-5h") and len(k) > 3:
            dname = k[:-3]
        elif k.endswith("-weekly") and len(k) > 7:
            dname = f"{k[:-7]}-w"
        else:
            dname = k

        used = round((1 - float(entry["remaining_fraction"])) * 100)
        reset_time = entry.get("reset_time")
        if not reset_time and "reset_in_seconds" in entry:
            reset_time = datetime.fromtimestamp(now + entry["reset_in_seconds"], tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        scoped.append({"display_name": dname, "utilization": used, "resets_at": reset_time})

    snap = {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "five_hour": {"used_percentage": None, "resets_at": None},
        "seven_day": {"used_percentage": None, "resets_at": None},
        "model_scoped": scoped,
        "quota_keys": sorted(quota.keys()) if isinstance(quota, dict) else []
    }

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w") as f:
        json.dump(snap, f)
except Exception as e:
    try:
        err_snap = {
            "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "five_hour": {"used_percentage": None, "resets_at": None},
            "seven_day": {"used_percentage": None, "resets_at": None},
            "model_scoped": [],
            "error": type(e).__name__
        }
        if "quota" in locals() and isinstance(quota, dict):
            err_snap["quota_keys"] = sorted(quota.keys())
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
        with open(out_path, "w") as f:
            json.dump(err_snap, f)
    except Exception:
        pass
' 2>/dev/null || true

export CURSOR_STATUSLINE_USAGE_SNAPSHOT="$snapshot_file"

sid=$(printf '%s' "$input" | jq -r '.session_id // .conversation_id // empty' 2>/dev/null)
cols=$(printf '%s' "$input" | jq -r '.terminal_width // .render_width_chars // empty' 2>/dev/null)
if [ -n "$cols" ] && [ "$cols" != "null" ]; then
  export COLUMNS="$cols"
fi

# Fallback model from settings.json if omitted
agy_model=""
if [ -f "${HOME}/.gemini/antigravity-cli/settings.json" ]; then
  agy_model=$(jq -r '.model // empty' "${HOME}/.gemini/antigravity-cli/settings.json" 2>/dev/null || true)
fi

input=$(printf '%s' "$input" | jq --arg cwd "$PWD" --arg agy_model "$agy_model" '
  if type != "object" then {} else . end
  | if (.model | not) or .model == null or (.model.display_name | not) then
      if .model.name then
        .model.display_name = .model.name | .model.id = (.model.id // .model.name)
      elif ($agy_model | length > 0) then
        .model.display_name = $agy_model | .model.id = $agy_model
      else . end
    else . end
  | if (.cwd | not) or .cwd == null or .cwd == "" then
      .cwd = (.workspace.current_dir // .workspace.workspace_dir // $cwd)
    else . end
  | if (.workspace.current_dir | not) or .workspace.current_dir == null then
      .workspace = ((.workspace // {}) + {
        current_dir: (.workspace.workspace_dir // $cwd),
        project_dir: (.workspace.workspace_dir // $cwd)
      })
    else . end
' 2>/dev/null || printf '%s' "$input")

# Render through claude-hud engine
dir=$(ls -d ~/.claude/plugins/cache/claude-hud/claude-hud/*/ 2>/dev/null | sort -V | tail -1)

if [ -n "$dir" ] && [ -x "$HOME/.bun/bin/bun" ]; then
  hud=$(printf '%s' "$input" | "$HOME/.bun/bin/bun" "${dir}src/index.ts" 2>/dev/null || true)
  # Strip Claude-only config counts (CLAUDE.md / hooks count)
  hud=$(printf '%s\n' "$hud" | grep -v 'CLAUDE\.md')
  if [ -n "$hud" ]; then
    printf '%s\n' "$hud"
  fi
fi

# Footer: Session ID and Ponytail badge
ponytail_badge=""
if [ -f "${HOME}/.claude/.ponytail-active" ]; then
  pmode=$(head -n1 "${HOME}/.claude/.ponytail-active" | tr -d '[:space:]')
  if [ -n "$pmode" ]; then
    if [ "$pmode" = "full" ]; then
      ponytail_badge="$(printf '\033[38;5;108m[PONYTAIL]\033[0m')"
    else
      ponytail_badge="$(printf '\033[38;5;108m[PONYTAIL:%s]\033[0m' "$(printf '%s' "$pmode" | tr '[:lower:]' '[:upper:]')")"
    fi
  fi
fi

meta_line=""
if [ -n "$sid" ]; then
  meta_line="$(printf '\033[2;38;5;245msid: %s\033[0m' "$sid")"
fi
if [ -n "$ponytail_badge" ]; then
  if [ -n "$meta_line" ]; then
    meta_line="${meta_line}  ${ponytail_badge}"
  else
    meta_line="${ponytail_badge}"
  fi
fi
if [ -n "$meta_line" ]; then
  printf '%s\n' "$meta_line"
fi
