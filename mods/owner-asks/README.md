# owner-asks

Version 0.1.0 keeps the owner's exact messages and their sources. It has no judge,
task state, classification, supersede, gate, relay or plugin controls.

## Messages and recall

One record per owner UUID lives in
`~/.local/state/owner-asks/<session-id>/owner.asks.jsonl`. Each record keeps raw
owner quote, UUID, composer/bridge origin, engine door and the owner-body span in
that UUID's transcript rendering. The complete mid-turn delivery wrapper is removed
once at entry; a wrapper typed as an ordinary prompt stays literal. Plugin rows,
engine notices, queue records and subagent messages never enter the source.
`<pasted_content id=…>` spans become `[pasted N chars]`; their contents are not
owner quotes. The span still points into the transcript rendering, so its length
can differ from the quote length. Existing records are not rewritten.

`~/.local/state/agent-hooks/<session-id>/asks-open.md` is derived directly from
those messages. The existing `~/.agents/hooks/compaction-recall.sh` reads it once
after compaction. This mod adds no external hook. Recovery reads the source file,
so neither recovery nor projection needs items or engine-state CAS.

The first engine tool result after resume carries one historical reminder.
The engine process identity distinguishes resume from a module reload; a small
plugin-local store entry preserves the pending reminder across reload. Normal
turns receive no full index. A resumed turn without a tool result waits for one.
Quoted historical text grants no new authority.

## Query and failures

`/asks` is read-only. It shows the source path, record count, projection path,
last failure and failure path. Arguments do not change state; there are no
`on`, `off` or `migrate` operations.

Failures write only error class, operation, instance and time to
`~/.local/state/owner-asks/<session-id>/last-failure.json`. Normal events write no
diagnostics or transcript notices. If storage itself rejects the failure record,
the error goes to the engine debug log and the in-memory record remains queryable.
No error switches capture off. A later dispatch can retry.

## Lifecycle and independence

Staged instances register commands but do no source IO before swap. Explicit reload
drains pending writes before it continues; retired callbacks cannot save. Source
writes compare the existing bytes and use atomic replace, preserving an externally
changed file on a mismatch. `/clear` starts a separate source under the new session ID.

This mod and `agent-should-know` work independently. They have different plugin
stores and state directories. `/asks` belongs here; `/heads-up` belongs to the relay.
This mod does not read or migrate the relay's historical ask or audit files.
`agent-should-know` is the original mod, for the built-in heads-up relay only.
`owner-asks` is the new mod split out of it for every other feature. It holds the
ask list now; the audit will be added to this mod after research, not to a third mod.
Audit research notes remain in `evals/retro-metrics/2026-W44/opinions/`.

## Local acceptance

Run `MOD=mods/owner-asks scripts/test-mod-permissions-smoke` for isolated unit,
permission and type checks. Run `python3 scripts/test-owner-asks-engine.py` for
interactive tmux acceptance with both mods and fresh session IDs. The script keeps
its fixture, transcript references and results under `.workflow/`. It does not
install or toggle plugins, or use existing owner sessions.

## Install

This candidate is local and has not been published. After its release, the marketplace command is:

```
/plugin install owner-asks@agent-scripts
```

## Limits

- Text blocks are indexed; media bytes are not copied into the source.
- The resume check needs `python3` and `ps`, and the existing recall hook must be
  configured for compaction recall. No new hook is installed by this mod.
- A failure to save an owner message is recorded, not retried automatically.
- A source larger than the engine's file IO limit requires separate maintenance.
