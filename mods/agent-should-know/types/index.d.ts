declare module 'claude-code' {
  interface PluginState {
    'agent-should-know': {
      'observer-v1': {
        schema_version: 1
        sid: string
        epoch: number
        rows: {
          schema_version: 1
          sid: string
          epoch: number
          instance: string
          uuid: string
          origin: string
          text: string
          items: {
            id: string
            start: number
            end: number
            text: string
            kind: 'unknown' | 'task' | 'constraint'
            answer?: string
            evidence?: string[]
            resolution?: { action: 'superseded' | 'deferred'; ownerUuid: string; start: number; end: number; quote: string }
          }[]
        }[]
        ledger: string | null
        projection: string | null
        pending: boolean
        instance: string
      }
    }
  }
}
