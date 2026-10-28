// The mod's $.state contract; it must be self-contained, so the row shape repeats lib/ledger.ts `Row` (tsc checks they match).
declare module 'claude-code' {
  interface PluginState {
    // G3: owner rows not yet in the ledger file.
    'agent-should-know': {
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
      }[]
    }
  }
}
