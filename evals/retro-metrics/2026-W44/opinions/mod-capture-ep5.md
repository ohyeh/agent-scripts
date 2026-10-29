# Item 3: owner capture under security middleware

Real engine, local checkout; no install or settings change.

Command: `python3 scripts/test-owner-asks-engine.py --episode5 capture`

```text
PASS episode5 capture: sent=5, recorded=5, skipped notices=0, security named=False
exit code: 0
```

Artifact: `.workflow/20261030015303-asks040-engine/result.json`.
Three owner turns precede `/reload-plugins`; one follows it; a fifth follows process
exit and `--resume`. All five accepted prompts have distinct owner UUIDs in the source.
The debug files show `cc-plugin-sec-default@builtin seated outermost` and its
`session.append` registration at `tier prepend`, while owner-asks is `tier user`.
This is the actual security plugin, not a stub that imitates it.

No owner-message loss was observed in this case, so capture logic was not changed.
There is no red line to repair for item 3: the brief says to fix only a measured miss.
The historical skip notice was not reproduced; this result does not prove arbitrary
future middleware cannot bypass a user-tier observer. Keep the sent/recorded measure.
