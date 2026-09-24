# W39 coverage audit — grok-bot-vm

- Window: 2026-09-17T12:00Z → 2026-09-24T12:00Z. All times UTC.
- Audit run: 2026-09-24 ~12:35Z, read-only over SSH (`bash -l`, stdin scripts, no files left on the target). Sqlite opened with `?mode=ro` or `?immutable=1`.
- Compared with: `2026-W39.json` `.machines["grok-bot-vm"]` and `.gaps`; collector `context-mode-local-insight` `bin/agent-sessions.mjs` @ 909d4db; `usage-dedupe.py`.
- Path notation: `~` = the target account home. This file contains no IPs, hostnames, or account names.

## Root cause for most of the mismatches: the container was recreated and its home restored on 2026-09-19

- This "VM" is a container: PID 1 = `tini -- pod-daemon`, `/.dockerenv` exists, cgroup `/agent`. There is no systemd, pm2, docker, or tmux server inside it.
- Container start: 2026-09-19T20:35Z (from `/proc/uptime`).
- Every file in the agent stores has mtime 2026-09-19T20:29–20:33Z: `~/.claude/projects` 26/26, `~/.gemini` 2,909 files in that hour, `~/.cursor/chats` 160/161, `~/agent-data/agent-transcripts` 362/362. A snapshot restore reset every mtime to the restore time.
- So every **mtime-windowed** W39 metric on this machine counts the whole restored history as W39 activity. Only metrics that use a **timestamp inside the file** are correct.
- Two sets of rules decide which W39 numbers are wrong: collector `agent-sessions.mjs` (claude/agy/cursor/grok use file mtime) and `usage-dedupe.py` (uses `os.path.getmtime`). The session-report analyzer uses `--since` on line timestamps, so it is not affected.

## Coverage table

| CLI | Store | Window sessions (direct) | Messages | Tokens | W39.json value | Match | Cause | Driver |
|---|---|---|---|---|---|---|---|---|
| claude 2.1.280 | `~/.claude/projects/*/*.jsonl` (26 top-level, 0 subagent) | **2** (line timestamps: 09-17T19:18Z `~/github/project-a`; 09-18T14:10Z `/workspace`) | 2 user + 2 assistant | **0** (both assistant rows are `<synthetic>`: "API Error: Request rejected (429) · All credentials for model gpt-5.6-…") | analyzer 2 sessions; collector 26; `total` 6,588,990 | sessions: analyzer yes / collector no; tokens: **no** | Collector 26 = restore mtime. The 6.59M tokens are rows from 08-27, 09-04 and 09-16 (235 rows, models glm-5.3 / glm-5.3-flash / gpt-5.6-luna; naive input 1,241,785 = `dedupe.naive_input`). usage-dedupe includes them because it windows by mtime. 242 rows without `requestId` = third-party router models plus `<synthetic>` rows, not a parser bug | Both `entrypoint=sdk-cli` (programmatic). 09-18 `/workspace`: probably a bot seat (same cwd and same minute as the agy burst below; UNCONFIRMED). 09-17 project-a (`bypassPermissions`): UNCONFIRMED. Human interactive: 0 (`~/.claude/history.jsonl` has 21 lines, newest 09-04 → none in window) |
| codex 0.156.1 | `~/.codex/sessions`, `~/.codex/archived_sessions` | **0** | 0 | 0 | 0 / 0 | yes | Both dirs do not exist. There are 0 `rollout-*.jsonl` anywhere under `~` or `/workspace`. `CODEX_HOME` is unset in the login shell and in the seat sessions. Positive control: the same collector path finds sessions on local-mbp14 (`~/.codex/sessions/{2025,2026}`), and the binary is installed. After the restore, seat terminals only ran `codex --version` | none |
| agy 1.2.6 | `~/.gemini/antigravity-cli/conversations/*.db` (49 db + wal + shm = 147 files); real timestamps in `conversation_summaries.db` | **5** (`last_modified_time` 09-18T14:11–14:26Z, all `CASCADE_RUN_STATUS_IDLE`, top-level, no parent) | steps: 112 (`mode=ro`, WAL applied) / 291 (`immutable=1`, main file only). The two views do not agree; probably a restore artifact | 無記帳 | 49 DBs / 49 trajectories / 5,612 steps | **no** | 49 = every DB ever created (restore mtime). 5,612 = all-time `steps` sum over all 49 DBs (this audit gets 5,612 with `mode=ro`). W38's 1/2 was a real window. The jump 1→49 is a restore artifact, not new work. `conversation_summaries` covers only 8 of the 49 DBs. `cli-20260918_14*.log` ×9, `workspaceDirs=[/workspace]` | **Bot seat via tmux-agent-tools worker**: 13 seat terminal files with 09-18T13–14 timestamps show `agent-tmux agy start` ×34, `send-wait` ×12, `result …` ×86, `stop` ×16 |
| cursor-agent 2026.09.18 | `~/.cursor/chats/<bucket>/<uuid>/{meta.json,store.db}` (43 chat dirs, 161 files) | **0** | 0 in window | 無記帳 | 1 chat / 8 messages / without_meta 1 | **no** | The 42 `meta.json` files all have `updatedAtMs` from 08-27 to 09-16 → 0 in window. The collector's single chat is the one dir without `meta.json`. For that dir the collector uses the store.db mtime, which is the restore time (09-19T20:29Z). The chat's own store.db `meta` record says `createdAt` 2026-08-27, and its 8 messages are all-time. "161 files" = 42 meta + 36 store.db + 35 wal + 35 shm + 9 prompt_history + 4 pasted_text, all restore-mtime. `~/.cursor/projects`: 557 files; the 26 changed after the restore are all in `workspace/{terminals,agent-tools}` (bot seat pty output, not cursor-agent chats). `/cursor/stores/self` (fuse) → I/O error, so its contents are UNCONFIRMED | none seen. The only running cursor process is `cursor-agent-store-fuse`; no `cursor-agent` CLI process |
| grok bot (seats) | collector reads `~/agent-data/agent-transcripts` (symlink to `~/sand-data`): 31 seat + 331 `sand-subagent-*` dirs. Live seats write to `AGENT_TRANSCRIPTS=~/.cursor/projects/workspace/agent-transcripts` instead | Conversations/messages in window: **UNCONFIRMED** (see below). Seat exec sessions started in window: **13** | local transcript stores: 0 in window | 無記帳 | seats 31 / child 331 / orphan 41 | **no** | seats 31 = 100% of seat files (restore mtime; W38's 16 was a real window). child/orphan are **all-time** counts in the collector, and are unchanged since W38 → **stale snapshot**: no transcript file under `agent-transcripts` is newer than the restore. The live `AGENT_TRANSCRIPTS` dir has 5 files and 0 after the restore. `search-index.db` `messages`: 6,424 rows, 08-25T14:27Z → 09-16T18:58Z, 0 in window | Bot host (see runtime section) |

### Proof for each 0

- claude tokens 0: the same parser reads real usage from the 235 out-of-window rows (glm-5.3 cache_read 9.7M etc.). So the in-window 0 is real: the two sessions got 429 rejections.
- codex 0: see the table (dirs do not exist; the same path works on a sibling machine).
- cursor 0: 42 `meta.json` files parse with dates up to 09-16. The reader works, and nothing is newer.
- grok local-store 0: the index holds 6,424 dated messages up to 09-16, and the transcript files parse (the collector reads 31 seats). No file is newer than the restore. This proves "nothing written locally". It does not prove "the bot was idle". The bot's per-agent `store.db` was not opened because of the collector's NOVA rule (no store.db / secrets / memory reads), so real bot message counts are **UNCONFIRMED**.

## Grok bot runtime and activity

- Shape: `pod-daemon` → `sand-exit-watch` → `start-exec-daemon`. There is one `exec-daemon/index.js serve` pty/websocket server per seat session (13 live). `sand-supervisor.mjs` supervises the bot host bundle `~/sand-host/host-main.cjs`. The host runs **inside** this container (started 2026-09-24T02:54Z; status `hostRunning=true`, `hostVersion 1f1562e`, last command `upgrade`).
- The lineage is a Cursor-derived sandbox: seat env has `__CURSOR_SANDBOX_ENV_RESTORE`, there is `cursor-agent-store-fuse` on `/cursor/stores`, and the transcripts use the `~/.cursor/projects/<ws>/…` layout.
- The 122 node processes: 116 run `/exec-daemon/node`, the bot runtime. They are 13 seat `serve` processes; 14 X desktops × 4 `box-bounded-log` log tailers (xvfb, xfwm4, x11vnc, picom); chrome and start-desktop log tailers; 5 `chrome-devtools-mcp`; the `sand-*` daemons (supervisor, window-router, web-bot-auth, ua-governor, session-sync, cookie-persist); and host-main. 6 run the user's node: 3 `context-mode`, 2 `vinext dev`, 1 project-a server. The single `cursor-agent-st…` process is the store fuse daemon.
- Which CLI a seat drives: a seat is a shell (pty) with an X desktop and Chrome. It drives CLIs through `agent-tmux <cli>` (seen for agy on 09-18). A seat is not bound to one CLI.
- Activity in window:
  - Seat sessions started: 13 (09-19T20:35Z without `AGENT_TRANSCRIPTS`, then 12 from 09-19T20:39Z to 09-24T08:19Z).
  - 26 seat terminal and agent-tools files written between 09-20 and 09-24.
  - The 09-18T13–14Z agy worker burst.
  - `agents/*/store.db-wal` touches clustered at 09-20T02Z (31) and 09-24T02Z (35, the same hour as the host-main restart). These look like host start sweeps, not chats (UNCONFIRMED).
- Errors: `sand-session-sync` log has 244,787 of 245,113 lines = "connecting to monitor on CDP port N failed: Error: no webSocketDebuggerUrl" (the lines have no timestamps; the log dates from container start). `sand-supervisor` log: 0 error lines.
- Nothing ran after the restore: no CLI store on this machine got a new session after 09-19T20:35Z. The only in-window CLI work was the 09-18 burst (claude ×2 failed with 429, agy ×5).

## Verdicts

1. **cursor 161 files vs 1 chat**: both numbers are wrong for W39. 161 = every file of 43 chat dirs, restore-mtime. The 1 chat = a 2026-08-27 chat without `meta.json`, windowed by the restore-bumped store.db mtime. True W39 = 0 chats.
2. **agy 1→49 jump**: this is not a real jump. 49 = all conversation DBs ever, windowed by restore mtime. True W39 = 5 conversations on 09-18, driven by a grok bot seat through `agent-tmux agy`.
3. **claude 2 vs 26**: the analyzer's 2 is correct. The collector's 26 is restore mtime. This reverses the `.gaps` claim that the analyzer 低估: the collector over-counts. Also, the W39 claude token total (6.59M) is 100% out-of-window; true W39 tokens = 0.
4. **grok child/orphan unchanged**: this is a stale snapshot. The counts are all-time, the transcript dir has not been written since the restore, and the live seats log to another dir, which is also empty since the restore. seats_in_window 31 is also an artifact.
5. **W38 hostname field**: W38 stored raw `socket.gethostname()`. Before the 2026-09-19T20:35Z recreation the container had a different hostname (masked here); a restored transcript written 09-19T20:30Z records the SSH login under that old hostname. After the recreation the hostname carries a numeric id (masked). W39 shows `grok-bot-vm` because the W39 plan writes the machine key into that field. Whether the old value is a sandbox default hostname is UNCONFIRMED.

## Collector changes needed

- Window by timestamps inside the files, not by mtime: claude line `timestamp`; agy `conversation_summaries.last_modified_time`; cursor `meta.updatedAtMs`, else store.db `meta.createdAt`/latest blob; grok `search-index.db messages.timestamp_ms` or seat-store timestamps.
- `usage-dedupe.py`: filter usage rows by message `timestamp` in window, and stop feeding mtime totals into `claude.total`/cost.
- Record container start time and a per-store mtime histogram. Flag a restore signature (for example >80% of files in one minute) and set the machine's mtime metrics to UNCONFIRMED.
- Record raw hostname (hashed) separately from the machine key, so container recreation is visible week over week.
- grok: read the seats' `AGENT_TRANSCRIPTS` dir too, label `childSeats`/`orphanChildSeats` as all-time, and add a windowed child count.
- cursor: report the no-meta fallback chats with their store.db `createdAt`, and probe `/cursor/stores` (currently I/O error). The fuse store may be where cursor-agent 2026.09.18 keeps new chats (UNCONFIRMED).
- agy: sum `step_count` from `conversation_summaries` for in-window conversations instead of all-time `steps` over mtime-selected DBs, and report DBs that have no summary row.
