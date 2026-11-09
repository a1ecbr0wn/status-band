export type Limit = { pct: number; resetsAt?: string }
export type Usage = { ctx: number; five: Limit; seven: Limit }
// The git branch and its status symbols, both empty outside a repository.
export type Git = { branch: string; flags: string }

declare module 'claude-code' {
  interface PluginState {
    'phosphor-status': { usage: Usage; host: string; version: string; git: Git }
  }
}
