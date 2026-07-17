---
name: canary-source-proof
description: Internal canary skill used only to prove that the `npx skills` add/list/update/remove lifecycle works correctly against this repository's published ref before real skill content is migrated here. Not a functional skill — do not invoke for any real task. Will be removed once real catalog content replaces it.
---

# canary-source-proof

This skill exists solely as a lifecycle canary for the `ohyeh/agent-scripts` spinout. It proves,
against a real published remote ref (never a local source directory), that a pinned
`npx skills` CLI version can discover, install, update, and remove a skill sourced from this
repository, and that the on-disk skill-lock metadata reflects the correct source and hash at
each step.

It has no operational instructions for an agent to follow. If you have reached this file while
looking for real guidance, this repository's real skill catalog has not been populated yet —
stop and report that instead of improvising.
