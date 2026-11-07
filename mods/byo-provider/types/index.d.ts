export type Row = { loop: string; model: string; last: string }
export type View = { rows: Row[]; agents: string; gate: string }

declare module 'claude-code' {
  interface PluginState {
    'byo-provider': { view: Shaped<View> }
  }
}
