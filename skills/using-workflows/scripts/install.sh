#!/usr/bin/env bash
# Deploy the bundled workflow recipes. Refuses to overwrite files whose
# content differs from the bundle unless --force is given.
#   install.sh --previous-manifest <file> [--force] [DEST]     DEST default: ~/.claude/workflows
#
# --previous-manifest <file> is required. It must list the file set this
# installer previously deployed (one repo-relative path per line). This lets
# the installer detect files it manages that the current source no longer
# ships (stale managed files) before writing anything.
#   missing/unreadable manifest -> "MANIFEST_REQUIRED" on stderr, exit 4
#   invalid manifest entry      -> "INVALID_MANIFEST_ENTRY <rel>" on stderr, exit 2
#   stale managed file present  -> "STALE_MANAGED <rel>" line(s) on stderr, exit 3
# All of the above are validated BEFORE anything under DEST is created or
# written -- a failing run must leave DEST exactly as it found it (absent or
# unchanged). Only once validation and the stale check pass does the
# installer create/mutate DEST.
# On success, the current source file set is atomically written to
# DEST/.using-workflows-managed-files (via a temp file created inside DEST,
# then renamed -- `mv` is only atomic within the same filesystem, and a
# system temp dir is not guaranteed to share one with DEST).
set -euo pipefail

force=0
dest="$HOME/.claude/workflows"
previous_manifest=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    --force) force=1; shift ;;
    --previous-manifest)
      previous_manifest="${2:-}"
      shift 2
      ;;
    *) dest="$1"; shift ;;
  esac
done

if [ -z "$previous_manifest" ] || [ ! -f "$previous_manifest" ]; then
  echo "MANIFEST_REQUIRED" >&2
  exit 4
fi

src="$(cd "$(dirname "$0")/../workflows" && pwd)"

# --- validation-only phase: no DEST path is created or written below until
#     this whole block passes. $tmp is a scratch dir for computing sets, not
#     part of DEST, so writing into it is not a DEST mutation. ---
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
find "$src" -type f -print | sed "s#^$src/##" | LC_ALL=C sort -u > "$tmp/current-set.txt"
LC_ALL=C sort -u "$previous_manifest" > "$tmp/previous-set.txt"
comm -23 "$tmp/previous-set.txt" "$tmp/current-set.txt" > "$tmp/stale-candidates.txt"
: > "$tmp/stale-present.txt"
while IFS= read -r rel; do
  case "$rel" in ''|/*|..|../*|*/..|*/../*) echo "INVALID_MANIFEST_ENTRY $rel" >&2; exit 2;; esac
  if [ -e "$dest/$rel" ] || [ -L "$dest/$rel" ]; then printf '%s\n' "$rel" >> "$tmp/stale-present.txt"; fi
done < "$tmp/stale-candidates.txt"
if [ -s "$tmp/stale-present.txt" ]; then sed 's/^/STALE_MANAGED /' "$tmp/stale-present.txt" >&2; exit 3; fi

conflicts=()
while IFS= read -r f; do
  rel="${f#"$src"/}"
  if [ -f "$dest/$rel" ] && ! cmp -s "$f" "$dest/$rel"; then
    conflicts+=("$rel")
  fi
done < <(find "$src" -type f)

if [ "${#conflicts[@]}" -gt 0 ] && [ "$force" -ne 1 ]; then
  echo "REFUSED: these files exist at $dest with DIFFERENT content:" >&2
  printf '  %s\n' "${conflicts[@]}" >&2
  echo "Review (diff) then re-run with --force to overwrite." >&2
  exit 1
fi

# --- mutation phase: validation and the stale check above have both passed,
#     so it is now safe to create/write under DEST. ---
mkdir -p "$dest/_lib"

while IFS= read -r f; do
  rel="${f#"$src"/}"
  mkdir -p "$dest/$(dirname "$rel")"
  cp "$f" "$dest/$rel"
  echo "installed: $dest/$rel"
done < <(find "$src" -type f)

sidecar_tmp="$dest/.using-workflows-managed-files.tmp.$$"
cp "$tmp/current-set.txt" "$sidecar_tmp"
mv "$sidecar_tmp" "$dest/.using-workflows-managed-files"

echo "done: $(find "$src" -type f | wc -l | tr -d ' ') file(s) → $dest"
