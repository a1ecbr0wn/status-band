export type Limit = { pct: number; resetsAt?: string }
export type Usage = { ctx: number; five: Limit; seven: Limit }

declare module 'claude-code' {
  interface PluginState {
    'status-band': { usage: Usage; host: string; version: string }
  }
}
