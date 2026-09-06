// Skill and workflow-loop usage from Claude Code transcripts on THIS host.
// Usage: node skill-usage-scan.mjs [projectsDir]   → JSON on stdout
// Signals: Skill() tool calls (main + subagent sidechains); loop stations reached in
// MAIN sessions via Workflow / Agent / agent-tmux / SendMessage / Skill.
// Codex, Cursor and opencode transcripts embed the skill roster in the prompt, so
// mention-counting them is noise; this script deliberately reads Claude only.
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const root = process.argv[2] || path.join(os.homedir(), '.claude/projects');
const ST = {
  plan: /design-consensus|plan-pipeline|feature-plan-consensus|feature-lifecycle-auto/,
  gate: /consensus-gate/,
  build: /spec-implement-dual-review-verify/,
  audit: /docs-vs-code-audit|design-vs-code-audit|root-cause-deep-dive-audit|project-direction-review/,
  triage: /findings-triage|pr-review-triage-resolve/,
};
function* files(d) {
  if (!fs.existsSync(d)) return;
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) yield* files(p); else if (e.name.endsWith('.jsonl')) yield p;
  }
}
const out = { host: os.hostname(), sessions: 0, mainSessions: 0, skillCalls: {}, skillSessions: {}, loop: { sessions: 0, stations: {}, channels: {}, sequences: {} } };
for (const f of files(root)) {
  let txt; try { txt = fs.readFileSync(f, 'utf8'); } catch { continue; }
  if (!txt.includes('tool_use')) continue;
  out.sessions++;
  const isMain = !path.basename(f).startsWith('agent-');
  if (isMain) out.mainSessions++;
  const seenSkill = new Set(), hit = new Set(), ch = new Set(), order = [];
  for (const line of txt.split('\n')) {
    if (!line.includes('tool_use')) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    const c = j.message?.content; if (!Array.isArray(c)) continue;
    for (const b of c) {
      if (b.type !== 'tool_use') continue;
      const inp = JSON.stringify(b.input || '');
      if (b.name === 'Skill') {
        const s = String(b.input?.skill || '').replace(/^.*:/, '');
        out.skillCalls[s] = (out.skillCalls[s] || 0) + 1;
        if (!seenSkill.has(s)) { seenSkill.add(s); out.skillSessions[s] = (out.skillSessions[s] || 0) + 1; }
      }
      if (!isMain) continue;
      const via = b.name === 'Workflow' ? 'Workflow' : b.name === 'Agent' ? 'Agent' : b.name === 'SendMessage' ? 'SendMessage'
        : b.name === 'Skill' ? 'Skill' : (b.name === 'Bash' && /agent-tmux/.test(inp)) ? 'tmux' : null;
      if (!via) continue;
      for (const [k, re] of Object.entries(ST)) if (re.test(inp)) { if (!hit.has(k)) order.push(k); hit.add(k); ch.add(via); }
    }
  }
  if (hit.size) {
    out.loop.sessions++;
    for (const k of hit) out.loop.stations[k] = (out.loop.stations[k] || 0) + 1;
    for (const v of ch) out.loop.channels[v] = (out.loop.channels[v] || 0) + 1;
    const key = order.join('>'); out.loop.sequences[key] = (out.loop.sequences[key] || 0) + 1;
  }
}
console.log(JSON.stringify(out));
