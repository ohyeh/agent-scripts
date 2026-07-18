#!/usr/bin/env bash
# Zero-dependency pre-push scrub for ohyeh/agent-scripts.
#
# Extends the W1+W2 base scrub (SECRET_RE + PATH_RE, plan
# `.workflow/next-direction/plan-agent-scripts-spinout.md:87-100`) per the
# W1+W2 binding carry-forward: "Before ANY next push (W4/W6): extend scrub
# with HOST_RE (hostnames + Tailscale 100.x IPs) + commit-metadata check."
#
# Scans ALL files staged for commit (both the index directly, via
# `git grep --cached`, and every reachable history commit, via
# `git grep $(git rev-list --all)`) plus the working tree. Exits 0 only on a
# clean scan; any match, any unexpected `git grep` exit code, a dirty
# worktree, or a broken object graph is a hard BLOCK (exit 1). Never weaken
# these patterns to make a scan pass -- fix the staged content instead.
#
# This file is intentionally NOT excluded from any scan. Each pattern that
# would otherwise self-match its own literal definition is built by
# concatenating adjacent quoted string fragments (e.g. 'ohYE''Hs') -- the
# evaluated pattern value is identical to a single-quoted literal, but the
# quote characters interrupting the substring in this file's own source text
# mean the pattern cannot match its own definition line. Do not "simplify"
# these concatenations back into single literals -- that reintroduces the
# self-match and would require re-adding a file-scope exclusion instead.
#
# Usage: scripts/scrub.sh [REPO] [EVIDENCE_DIR]
#   REPO         defaults to the repo containing this script.
#   EVIDENCE_DIR defaults to $REPO/.scrub-evidence (caller may point this at
#                a durable .workflow results directory instead).
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO="${1:-$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)}"
EVIDENCE="${2:-$REPO/.scrub-evidence}"
mkdir -p "$EVIDENCE"

# --- base patterns (W1+W2) ---
SECRET_RE='(-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})'
PATH_RE='(/User''s/[^/[:space:]]+|/hom''e/[^/[:space:]]+|/priv''ate/tmp/)'

# --- W4 extension: machine hostnames (this fleet's known patterns) ---
# --- W9 addition: no-hyphen serial variant + the tailnet domain suffix (additive only, per binding carry-forward: never weaken existing alternatives) ---
HOST_RE='(oh''YEHs|MB''P|Mac-''Mini|25006''93-paul|25006931Pa''ul|\.t''s\.net)'

# --- W4 extension: Tailscale CGNAT range, RFC 6598 (second octet 64-127 under the 100/8 block) ---
TAILSCALE_RE='100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.'

# --- W4 extension: the private company email this fleet must never publish ---
PRIVATE_EMAIL_RE='paulyeh@econcord\.com\.tw'

git -C "$REPO" rev-list --all > "$EVIDENCE/scrub-commits.txt"

set +e
git -C "$REPO" grep -nEI "$SECRET_RE"        $(cat "$EVIDENCE/scrub-commits.txt") -- . > "$EVIDENCE/secret-scan.txt";        secret_rc=$?
git -C "$REPO" grep -nEI "$PATH_RE"          $(cat "$EVIDENCE/scrub-commits.txt") -- . > "$EVIDENCE/path-scan.txt";          path_rc=$?
git -C "$REPO" grep -nEI "$HOST_RE"          $(cat "$EVIDENCE/scrub-commits.txt") -- . > "$EVIDENCE/host-scan.txt";          host_rc=$?
git -C "$REPO" grep -nEI "$TAILSCALE_RE"     $(cat "$EVIDENCE/scrub-commits.txt") -- . > "$EVIDENCE/tailscale-scan.txt";     ts_rc=$?
git -C "$REPO" grep -nEI "$PRIVATE_EMAIL_RE" $(cat "$EVIDENCE/scrub-commits.txt") -- . > "$EVIDENCE/private-email-scan.txt"; email_rc=$?

# --- index/staged-file scan (git grep --cached): required in addition to the
#     history scan above -- rev-list --all only reaches committed objects,
#     never the index, so a file staged but not yet committed would slip
#     through without this. ---
git -C "$REPO" grep --cached -nEI "$SECRET_RE"        -- . > "$EVIDENCE/secret-scan-staged.txt";        secret_staged_rc=$?
git -C "$REPO" grep --cached -nEI "$PATH_RE"          -- . > "$EVIDENCE/path-scan-staged.txt";          path_staged_rc=$?
git -C "$REPO" grep --cached -nEI "$HOST_RE"          -- . > "$EVIDENCE/host-scan-staged.txt";          host_staged_rc=$?
git -C "$REPO" grep --cached -nEI "$TAILSCALE_RE"     -- . > "$EVIDENCE/tailscale-scan-staged.txt";     ts_staged_rc=$?
git -C "$REPO" grep --cached -nEI "$PRIVATE_EMAIL_RE" -- . > "$EVIDENCE/private-email-scan-staged.txt"; email_staged_rc=$?
set -e

for rc in "$secret_rc" "$path_rc" "$host_rc" "$ts_rc" "$email_rc" \
          "$secret_staged_rc" "$path_staged_rc" "$host_staged_rc" "$ts_staged_rc" "$email_staged_rc"; do
  test "$rc" -eq 0 || test "$rc" -eq 1
done

test ! -s "$EVIDENCE/secret-scan.txt"
test ! -s "$EVIDENCE/path-scan.txt"
test ! -s "$EVIDENCE/host-scan.txt"
test ! -s "$EVIDENCE/tailscale-scan.txt"
test ! -s "$EVIDENCE/private-email-scan.txt"
test ! -s "$EVIDENCE/secret-scan-staged.txt"
test ! -s "$EVIDENCE/path-scan-staged.txt"
test ! -s "$EVIDENCE/host-scan-staged.txt"
test ! -s "$EVIDENCE/tailscale-scan-staged.txt"
test ! -s "$EVIDENCE/private-email-scan-staged.txt"

# --- W4 extension: commit-metadata scan ---
# Author/committer name+email over every commit, checked against every
# pattern above. Every commit must carry exactly the accepted identity,
# JENHAO YEH <ohyeh0412@gmail.com> (user-approved 2026-07-17; the canary
# commit's legacy identity was rewritten out of history with user approval).
# Any commit with any other identity blocks the scrub.
git -C "$REPO" log --all --format='%H %an %ae %cn %ce' > "$EVIDENCE/commit-metadata.txt"

set +e
grep -nE "$SECRET_RE|$PATH_RE|$HOST_RE|$TAILSCALE_RE|$PRIVATE_EMAIL_RE" "$EVIDENCE/commit-metadata.txt" > "$EVIDENCE/commit-metadata-flagged.txt"; meta_rc=$?
set -e
test "$meta_rc" -eq 1
test ! -s "$EVIDENCE/commit-metadata-flagged.txt"

CURRENT_IDENTITY='JENHAO YEH ohyeh0412@gmail.com JENHAO YEH ohyeh0412@gmail.com'
sort -u "$EVIDENCE/commit-metadata.txt" > "$EVIDENCE/commit-metadata-unique.txt"
: > "$EVIDENCE/commit-metadata-unexpected.txt"
while IFS= read -r line; do
  test -z "$line" && continue
  identity="${line#* }"
  if [ "$identity" != "$CURRENT_IDENTITY" ]; then
    printf '%s\n' "$line" >> "$EVIDENCE/commit-metadata-unexpected.txt"
  fi
done < "$EVIDENCE/commit-metadata-unique.txt"
test ! -s "$EVIDENCE/commit-metadata-unexpected.txt"

# --- worktree/object-graph sanity (unchanged from W1+W2) ---
test -z "$(git -C "$REPO" status --porcelain)"
git -C "$REPO" fsck --full --no-reflogs

printf 'VERDICT: PASS\n' > "$EVIDENCE/scrub-verdict.txt"
echo "VERDICT: PASS"
