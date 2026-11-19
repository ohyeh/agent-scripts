export type Row = { loop: string; profile: string; last: string }
export type View = { rows: Row[]; agents: string; profiles: string; ok: number; fails: { who: string; why: string }[] }

declare module 'claude-code' {
  interface PluginState {
    'byo-provider': { view: Shaped<View> }
  }
}
