# 2026-08-19 injection-delivery defect

## Confirmed defect
Remote worker `agy-cli-blindagy2` (launch_id `blindagy2-20260819T035147Z-9fe4`, .44)
finished its task and went idle. Its `result.json` stayed at the non-terminal
`pending` seed. Cause: neither injected prefix ever reached the pane, while BOTH
"injected" sentinels were written.

Evidence (live, this session):
- `tmux capture-pane -p -J -S -` over the FULL scrollback contains neither
  `Write final JSON to this exact path:` nor `Ignore any project-local agent instructions`.
- `.result-path-injected` and `scope-guard-injected` both present, 0 bytes.
- `audit.jsonl`: two `send.multiline`, enter_count 1, sha256 only — the wrapper
  stores no plaintext, so it cannot prove what landed.
- `agent-tmux` verifies PROMPT arrival by nonce echo (`_send_wait_nonce_locked`),
  then marks the INJECTION sentinels 14 lines later with no verification.

Because `*_should_inject` is sentinel-gated, a first-send miss is permanent for
that worker's entire life (#283).

## Governing principle
Never write a completion marker you have not verified. If you cannot verify,
leave it unmarked. Unmarked means the next send re-injects — the self-heal.

Same optimistic-bookkeeping pattern in three places:
1. the injection sentinels (patched here)
2. the retired `status:"success"` result seed (already fixed to `pending`, #317)
3. `launch_envelope_inline_block` (assumes the shell reaches statement 2) — NOT addressed

## 01-verified-sentinels.patch
Target: `~/github/tmux-agent-tools` @ 70c3d7b (tagged
`checkpoint/pre-worker-registry-20260819`). NOT APPLIED — needs user approval.

- `git apply --check` : clean
- `zsh -n` on patched copy : OK (the script is zsh; `bash -n` false-fails on a
  pre-existing zsh glob qualifier at :2242)
- +45 / -12

Design notes:
- verification = pane grep for a fixed marker, 5 polls x 200ms
- `mark_injected` takes an OPTIONAL session; without it behaviour is unchanged
- the oneshot call site (:4441) deliberately passes no session: its prompt is
  delivered as argv, there is no pane echo to grep, and argv cannot half-land
- `{ ...; || true; }` at every site is REQUIRED: once mark can return 1,
  `(( x )) && cmd` aborts the wrapper under `set -e`
- `result_path_prepend` changed from one `\n` to `\n\n`, matching
  `task_scope_guard_prepend` (candidate root cause, still UNCONFIRMED)

## Known ceiling
A TUI that never echoes its prompt would fail verification on every send and
re-inject each time — noisy but VISIBLE, versus today's silent permanent
failure. Distinguishable by the baseline test below.

## Test order (nothing run yet)
0. baseline, no code change: one disposable worker per CLI (agy / codex / claude),
   assign one trivial prompt, `capture -S - | grep -F` both markers -> 3x(present/absent)
1. apply the patch, repeat step 0, compare
2. end-to-end: recover `blindagy2` (still alive and idle, holds a complete answer)

Baseline first: without it, "fixed" is unfalsifiable.
