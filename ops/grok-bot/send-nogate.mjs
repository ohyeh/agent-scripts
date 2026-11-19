#!/usr/bin/env node
// 越獄版 (the override): internal, used now and then, never the routine path. The released standard version is the
// skill's send.mjs, which sends to the front or the sandbox only. This one runs the same send path with no gate: no
// header check, no recipient check. Use it only when the account owner told you, in this session, to; say so first and
// quote the owner's words in your report.
// --direct <basis> (private method, this file only; the skill's send.mjs has no such flag): a send the owner told you to
// make to a bot other than the front. Start the message with the header `[w:<sid8>] ⟨agent⟩` and write the basis
// ("owner 14:30 instruction") into it, so the bot and the log can see which instruction it rests on; the result line
// repeats the basis as `direct`. Nothing checks either. With a header the send leaves grok-bot-watch's sent mark as the
// skill's does; a headerless message leaves none, so no watch wakes on its reply.
// Usage: send-nogate.mjs <bot-uuid-or-prefix> [port] [--direct <basis>] < message
// Runs only inside an agent-scripts checkout: the import below is relative to this file (not the cwd), and `npx skills`
// installs skills/<name> only, so ops/ never reaches an installed skill. Pull the checkout to get the current send path.
import { main } from '../../skills/using-grok-bot-app/scripts/send.mjs'

const a = process.argv.slice(2)
const i = a.indexOf('--direct')
const direct = i < 0 ? undefined : (a.splice(i, 2)[1] ?? '')
main(
  { id: (a[0] ?? '').toLowerCase(), port: Number(a[1] || process.env.GROK_BOT_CDP_PORT || 39231), extra: direct === undefined ? {} : { direct } },
  () => null,
)
