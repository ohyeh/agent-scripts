// The mod's $.state contract; tsc checks it against the runtime row and guard shapes.
declare module 'claude-code' {
  type AskDuty = { u: number; need?: 'align' | 'retro' | null; why?: string; tries: number; retro?: string; missing?: string[] }
  type AskEpisode = {
    k: number; from: number; fails: number; calls: number; unchecked: string | null
    findings: { id: string; check: 'a' | 'b' | 'c' | 'd' | 'e'; source: 'reply' | 'ask' | 'align' | 'tool' | 'coverage'; quote: string; ask_id?: string; tool_use_id?: string; problem: string }[]
  }
  interface PluginState {
    // G3: owner rows not yet in the ledger file.
    'agent-should-know': {
      guard: { sid: string; generation: number; files: Record<string, string>; held: string | null; duties: AskDuty[]; episode: AskEpisode; dirty: boolean }
      replay: {
        u: number
        at: string
        origin: 'owner' | 'owner-command' | 'unknown' | 'transcript'
        text: string
        attachments: string[]
        turnId?: string
        seen: number
        quoted?: [number, number][]
        closed?: boolean
        constraint?: boolean
        confirmed?: boolean
        duty?: AskDuty | null
        episode?: AskEpisode
      }[]
    }
  }
}
