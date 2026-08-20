# Verbatim evidence — leaked literals in the session-title-as-address handoff

Not scanned by `public-sensitive-literals` (its pathspec is `.agents`,
`.claude/handoffs`, `scripts` — see `scripts/check-rules-invariants.mjs:133`).
Kept verbatim here so the lesson in `.agents/rules/lessons.md` can carry
placeholders without losing its evidence.

File: `.claude/handoffs/2026-08-20-122706-session-title-as-address.md`
Fixed in: aa79363

## Class 1 — absolute home path (line 5, the checker's FIRST match)

    - Project: /Users/paul.yeh/git/agent-scripts

Checker output, verbatim:

    FAIL  public-sensitive-literals  (.claude/handoffs/2026-08-20-122706-session-title-as-address.md:5:- Project: /Users/paul.yeh/git/agent-scripts

Redacted to `~/git/agent-scripts`.

## Class 2 — Tailscale IPs (lines 33 / 87 / 173, surfaced only after class 1 was fixed)

    33:  to two hosts (`local` and `100.77.191.62`), verified at SHA
    87:  - [x] Pushed to `origin/main`, deployed to `local` and `100.77.191.62`, both verified.
    173: - Tailscale: this host is `100.64.190.44`; the second deploy target is `100.77.191.62`.)

Redacted to `<peer-host>` / `<this-host>`.

## Why the misattribution happened

This session ran the checker only AFTER redacting line 5, saw class 2, and
concluded class 1 had never been a hit — inferring a past cause from an
already-fixed state. `git grep` reports every match, but the check stores only
`sensitive.stdout` and the display shows the first line, so one fix at a time
reads as "that was the problem" rather than "that was the first problem".
Peer session 37839e4b quoting the original first line verbatim is what caught it.
