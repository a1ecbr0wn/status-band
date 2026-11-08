import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Usage } from '../types'

const EMPTY: Usage = { ctx: 0, five: { pct: 0 }, seven: { pct: 0 } }
const usage = atom({ plugin: 'status-band', key: 'usage' } as const, EMPTY)
const host = atom({ plugin: 'status-band', key: 'host' } as const, '')
const version = atom({ plugin: 'status-band', key: 'version' } as const, '')

// Phosphor palette (Rio terminal theme): near-black green background, neutral body text,
// green for meters and the terminal rule, ANSI accents.
const C = {
  bg: '#000A00',
  text: '#E8E8E8',
  dim: '#A0A0A0',
  green: '#1AFF12',
  track: '#00B300',
  blue: '#00C8FF',
  yellow: '#FFEA00',
} as const

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
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await setup($).catch(() => undefined)
    return next(e)
  }).catch(($, e, next) => next(e))

  // After each main turn the context fill and rate limits have moved: the write redraws the band.
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

    const sep = <Text color={C.dim}> | </Text>
    // The top line is looser: its items are short and read better apart.
    const wideSep = <Text color={C.dim}>{'   |   '}</Text>
    const meter = (label: string, pct: number, reset = '') => {
      const filled = filledCells(pct)
      return (
        <Text color={C.text}>
          <Text color={C.dim}>{label}:</Text>
          <Text color={C.green}>{'▓'.repeat(filled)}</Text>
          <Text color={C.track}>{'░'.repeat(BAR_WIDTH - filled)}</Text>
          {pct}%{reset === '' ? '' : <Text color={C.dim}> {reset}</Text>}
        </Text>
      )
    }

    const mine = (
      <Box flexDirection="column" backgroundColor={C.bg}>
        {/* The terminal draws a green rule across the top of the band. */}
        {e.surface === 'terminal' && <Text color={C.green} wrap="truncate-end">{'─'.repeat(e.props.bodyColumns)}</Text>}
        <Text color={C.text} wrap="truncate-end">
          [<Text color={C.blue}>{model}</Text>]{wideSep}🖥  {await read($, host)}{wideSep}📁 {dir}{wideSep}
          <Text color={C.yellow}>v{await read($, version)}</Text>
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
