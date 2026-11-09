import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Git, Limit, Usage } from '../types'

const EMPTY: Usage = { ctx: 0, five: { pct: 0 }, seven: { pct: 0 } }
const NO_GIT: Git = { branch: '', flags: '' }
const usage = atom({ plugin: 'phosphor-status', key: 'usage' } as const, EMPTY)
const host = atom({ plugin: 'phosphor-status', key: 'host' } as const, '')
const version = atom({ plugin: 'phosphor-status', key: 'version' } as const, '')
const git = atom({ plugin: 'phosphor-status', key: 'git' } as const, NO_GIT)

// Phosphor palette (Rio terminal theme): near-black green background, neutral body text,
// green for meters, the terminal rule and the desktop outline, ANSI accents (magenta for the
// git branch and red for its status symbols, as starship colours them).
const C = {
  bg: '#000A00',
  text: '#E8E8E8',
  dim: '#A0A0A0',
  green: '#1AFF12',
  track: '#00B300',
  blue: '#00C8FF',
  yellow: '#FFEA00',
  magenta: '#FF14C8',
  red: '#FF1414',
} as const

// Starship's branch symbol (a Nerd Font glyph), written as an escape so it survives editors.
const BRANCH = '\ue0a0'

const BAR_WIDTH = 10
const filledCells = (pct: number) => Math.max(0, Math.min(BAR_WIDTH, Math.floor((pct * BAR_WIDTH) / 100)))

// "claude-opus-5-5" → "Opus 5.5": the family capitalised, version numbers joined by dots.
// Also takes a date or context suffix ("-20251001", "[1m]") and the older order ("claude-3-5-sonnet").
export const modelName = (id: string) => {
  const parts = id.trim().replace(/\[.*\]$/, '').replace(/-\d{8}$/, '').split('-')
  if (parts[0] !== 'claude' || parts.length < 2) return id
  const words = parts.slice(1).filter(p => !/^\d+$/.test(p))
  const version = parts.slice(1).filter(p => /^\d+$/.test(p)).join('.')
  if (words.length === 0) return id
  const family = words.map(w => w[0]!.toUpperCase() + w.slice(1)).join(' ')
  return version === '' ? family : `${family} ${version}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number) => String(n).padStart(2, '0')
const hhmm = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`
// statusline.sh: 5h reset as "%H:%M", 7d reset as "%b %-d, %H:%M".
const fmt = (iso: string | undefined, withDay: boolean) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return withDay ? `${MONTHS[d.getMonth()]} ${d.getDate()}, ${hhmm(d)}` : hhmm(d)
}

const toUsage = (u: { context: { percent?: number }; rateLimits: { kind: string; percentUsed: number; resetsAt?: string }[] }): Usage => {
  const limit = (kind: string): Limit => {
    const r = u.rateLimits.find(l => l.kind === kind)
    return { pct: Math.floor(r?.percentUsed ?? 0), resetsAt: r?.resetsAt }
  }
  return { ctx: Math.floor(u.context.percent ?? 0), five: limit('five_hour'), seven: limit('seven_day') }
}

// `git status --porcelain=v2 --branch --show-stash` as starship's git_status shows it: the branch
// (the short hash when detached) and the symbols that apply, in starship's order:
// = conflicted, $ stashed, ✘ deleted, » renamed, ! modified, + staged, ? untracked,
// then ⇡ ahead, ⇣ behind or ⇕ diverged from the upstream. Empty outside a repository.
export const gitSummary = (out: string): Git => {
  let head = ''
  let oid = ''
  let ahead = 0
  let behind = 0
  let stash = 0
  const seen = new Set<string>()
  for (const line of out.split('\n')) {
    if (line.startsWith('# branch.head ')) head = line.slice(14).trim()
    else if (line.startsWith('# branch.oid ')) oid = line.slice(13).trim()
    else if (line.startsWith('# branch.ab ')) {
      const m = /^\+(\d+) -(\d+)$/.exec(line.slice(12).trim())
      if (m) {
        ahead = Number(m[1])
        behind = Number(m[2])
      }
    } else if (line.startsWith('# stash ')) stash = Number(line.slice(8))
    else if (line.startsWith('u ')) seen.add('=')
    else if (line.startsWith('? ')) seen.add('?')
    else if (line.startsWith('1 ') || line.startsWith('2 ')) {
      // "1 XY ..." / "2 XY ...": X is the index's state, Y the working tree's.
      const x = line[2]
      const y = line[3]
      if (x === 'D' || y === 'D') seen.add('✘')
      if (x === 'R' || y === 'R') seen.add('»')
      if (y === 'M' || y === 'T') seen.add('!')
      if (x === 'A' || x === 'M' || x === 'C' || x === 'T') seen.add('+')
    }
  }
  if (head === '') return NO_GIT
  if (stash > 0) seen.add('$')
  const state = ['=', '$', '✘', '»', '!', '+', '?'].filter(s => seen.has(s)).join('')
  const upstream = ahead > 0 && behind > 0 ? '⇕' : ahead > 0 ? '⇡' : behind > 0 ? '⇣' : ''
  return { branch: head === '(detached)' ? oid.slice(0, 7) : head, flags: state + upstream }
}

async function setup($: EngineInterface) {
  const h = await $.process.run(['hostname', '-s']).catch(() => undefined)
  await update($, host, () => (h?.exitCode === 0 ? h.stdout.trim() : ''))
  const v = await $.session.version().then(r => r.version).catch(() => '')
  await update($, version, () => v)
  await refresh($)
}

async function refresh($: EngineInterface) {
  const u = await $.session.usage().catch(() => undefined)
  if (u) await update($, usage, () => toUsage(u))
  await refreshGit($)
}

// --no-optional-locks keeps the poll from taking the index lock a commit or an editor may want.
async function refreshGit($: EngineInterface) {
  const r = await $.process
    .run(['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch', '--show-stash'], { timeoutMs: 5000 })
    .catch(() => undefined)
  // A git that would not run or timed out leaves the last branch showing; git saying no (not a repository) clears it.
  if (r) await update($, git, () => (r.exitCode === 0 ? gitSummary(r.stdout) : NO_GIT))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await setup($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  // After each main turn the context fill, rate limits and git status may have moved: the write redraws the band.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) await refresh($)
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    // Other mods share this slot: draw theirs below ours.
    const below = await next(e).catch(() => undefined)

    const u = await read($, usage)
    const model = modelName(await $.session.model().catch(() => ''))
    const dir = (await $.session.cwd()).replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
    const { Box, Text } = $.ui.resolve(e)

    // Every Text is `mono` so the desktop app aligns the meters and the git glyphs in its
    // monospaced face (the terminal is always monospaced and ignores it).
    const sep = <Text mono color={C.dim}> | </Text>
    // The top line is looser: its items are short and read better apart.
    const wideSep = <Text mono color={C.dim}>{'   |   '}</Text>
    const meter = (label: string, pct: number, reset = '') => {
      const filled = filledCells(pct)
      return (
        <Text mono color={C.text}>
          <Text mono color={C.dim}>{label}:</Text>
          <Text mono color={C.green}>{'▓'.repeat(filled)}</Text>
          <Text mono color={C.track}>{'░'.repeat(BAR_WIDTH - filled)}</Text>
          {pct}%{reset === '' ? '' : <Text mono color={C.dim}> {reset}</Text>}
        </Text>
      )
    }

    // starship-style: the branch, then the symbols for what has changed. Nothing outside a repository.
    const g = await read($, git)
    const branch =
      g.branch === '' ? null : (
        <Text mono>
          <Text mono color={C.magenta}>{`${BRANCH} ${g.branch}`}</Text>
          {g.flags === '' ? '' : <Text mono color={C.red}> {g.flags}</Text>}
        </Text>
      )

    // The terminal gets a rule across the top; the desktop app, where a rule looks out of place,
    // gets a rounded green outline instead.
    const outline = e.surface === 'terminal' ? {} : { borderStyle: 'round' as const, borderColor: C.green }

    const mine = (
      <Box flexDirection="column" backgroundColor={C.bg} {...outline}>
        {/* The terminal draws a green rule across the top of the band. */}
        {e.surface === 'terminal' && <Text mono color={C.green} wrap="truncate-end">{'─'.repeat(e.props.bodyColumns)}</Text>}
        <Text mono color={C.text} wrap="truncate-end">
          [<Text mono color={C.blue}>{model}</Text>]{wideSep}🖥  {await read($, host)}{wideSep}📁 {dir}{wideSep}
          {branch}{branch === null ? null : wideSep}
          <Text mono color={C.yellow}>v{await read($, version)}</Text>
        </Text>
        <Box flexDirection="row">
          {meter('ctx', u.ctx)}
          {sep}
          {meter('5h', u.five.pct, fmt(u.five.resetsAt, false))}
          {sep}
          {meter('7d', u.seven.pct, fmt(u.seven.resetsAt, true))}
        </Box>
      </Box>
    )
    return below ? <Box flexDirection="column">{mine}{below}</Box> : mine
  }).catch(($, e, next) => next(e))
}
