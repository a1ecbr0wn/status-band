export type Limit = { pct: number; resetsAt?: string }
export type Usage = { ctx: number; five: Limit; seven: Limit }

declare module 'claude-code' {
  interface PluginState {
    'phosphor-status': { usage: Usage; host: string; version: string }
  }
}
