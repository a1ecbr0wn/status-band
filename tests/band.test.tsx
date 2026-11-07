import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'status-band',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

test('the band shows model, folder and the three meters', async ($, on) => {
  on('session.model', () => ({ value: 'Opus' }) as never)
  on('session.cwd', () => ({ value: '/home/me/scripts' }) as never)
  on('session.measure', (_, e) => ({ changed: e.changed }))

  await $.session.measure({
    context: { window: 200000, percent: 42.7 },
    rateLimits: [
      { kind: 'five_hour', percentUsed: 15 },
      { kind: 'seven_day', percentUsed: 99.9 },
    ],
    changed: ['context', 'rateLimits'],
  } as never)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /Opus/ }))?.text).toContain('📁 scripts')
  expect((await ui.find({ type: 'Text', text: /^ctx:/ }))?.text).toBe('ctx:▓▓▓▓░░░░░░42%')
  expect((await ui.find({ type: 'Text', text: /^5h:/ }))?.text).toBe('5h:▓░░░░░░░░░15%')
  expect((await ui.find({ type: 'Text', text: /^7d:/ }))?.text).toBe('7d:▓▓▓▓▓▓▓▓▓░99%')
  await ui.unmount()
})
