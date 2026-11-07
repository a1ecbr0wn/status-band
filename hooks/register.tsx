import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Limit, Usage } from '../types'

const EMPTY: Usage = { ctx: 0, five: { pct: 0 }, seven: { pct: 0 } }
const usage = atom({ plugin: 'status-band', key: 'usage' } as const, EMPTY)
const host = atom({ plugin: 'status-band', key: 'host' } as const, '')
const version = atom({ plugin: 'status-band', key: 'version' } as const, '')

// Phosphor palette (Rio terminal theme): neutral body text, green for meters, ANSI accents.
const C = {
  text: '#E8E8E8',
  dim: '#A0A0A0',
  green: '#1AFF12',
  track: '#00B300',
  blue: '#00C8FF',
  yellow: '#FFEA00',
} as const

const BAR_WIDTH = 10
const filledCells = (pct: number) => Math.max(0, Math.min(BAR_WIDTH, Math.floor((pct * BAR_WIDTH) / 100)))

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
  const v = (await $.session.version()).version
  await update($, version, () => v)
  const u = await $.session.usage().catch(() => undefined)
  if (u) await update($, usage, () => toUsage(u))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await setup($).catch(() => undefined)
    return next(e)
  })

  // Fires when the context fill, a rate-limit window or the cost moves: the write redraws the band.
  on('session.measure', async ($, e, next) => {
    await update($, usage, () => toUsage(e))
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    // Other mods share this slot: draw theirs below ours.
    const below = await next(e).catch(() => undefined)

    const u = await read($, usage)
    const model = await $.session.model().catch(() => '')
    const dir = (await $.session.cwd()).replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
    const { Box, Text } = $.ui.resolve(e)

    const sep = <Text color={C.dim}> | </Text>
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
      <Box flexDirection="column">
        <Text color={C.text} wrap="truncate-end">
          [<Text color={C.blue}>{model}</Text>]{sep}🖥  {await read($, host)}{sep}📁 {dir}{sep}
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
  })
}
