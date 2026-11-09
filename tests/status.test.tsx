import { expect, test } from 'claude-code/testing'

import { gitSummary, modelName } from '../hooks/register'

test('model ids read as their names', () => {
  expect(modelName('claude-opus-5-5')).toBe('Opus 5.5')
  expect(modelName('claude-sonnet-5-5[1m]')).toBe('Sonnet 5.5')
  expect(modelName('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
  expect(modelName('claude-fable-5-1')).toBe('Fable 5.1')
  expect(modelName('claude-opus-5')).toBe('Opus 5')
  expect(modelName('claude-3-5-sonnet-20241022')).toBe('Sonnet 3.5')
  expect(modelName('Opus 5.5')).toBe('Opus 5.5')
  expect(modelName('')).toBe('')
})

const status = (...lines: string[]) => ['# branch.oid 0123456789abcdef', '# branch.head main', ...lines].join('\n')

test('git status reads as starship shows it', () => {
  expect(gitSummary('')).toEqual({ branch: '', flags: '' })
  expect(gitSummary(status())).toEqual({ branch: 'main', flags: '' })
  expect(gitSummary(status('1 .M N... 100644 100644 100644 a b f.rs'))).toEqual({ branch: 'main', flags: '!' })
  expect(gitSummary(status('1 A. N... 000000 100644 100644 a b f.rs'))).toEqual({ branch: 'main', flags: '+' })
  expect(gitSummary(status('? new.txt'))).toEqual({ branch: 'main', flags: '?' })
  expect(gitSummary(status('1 D. N... 100644 000000 000000 a b f.rs'))).toEqual({ branch: 'main', flags: '✘' })
  expect(gitSummary(status('2 R. N... 100644 100644 100644 a b R100 new.rs\told.rs'))).toEqual({ branch: 'main', flags: '»' })
  expect(gitSummary(status('u UU N... 100644 100644 100644 100644 a b c f.rs'))).toEqual({ branch: 'main', flags: '=' })
  // Several at once come in starship's order, then the upstream arrow.
  expect(
    gitSummary(
      status('# branch.ab +2 -0', '# stash 1', '? new.txt', '1 AM N... 000000 100644 100644 a b f.rs'),
    ),
  ).toEqual({ branch: 'main', flags: '$!+?⇡' })
  expect(gitSummary(status('# branch.ab +0 -3'))).toEqual({ branch: 'main', flags: '⇣' })
  expect(gitSummary(status('# branch.ab +1 -3'))).toEqual({ branch: 'main', flags: '⇕' })
  // Detached: the short hash stands in for the branch.
  expect(gitSummary('# branch.oid 0123456789abcdef\n# branch.head (detached)')).toEqual({ branch: '0123456', flags: '' })
})

const STRIP = {
  plugin: 'phosphor-status',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 100, scroll: { offset: 0, bodyRows: 12 }, view: {} },
} as const

for (const surface of ['terminal', 'desktop'] as const) {
test(`the band shows model, folder and the three meters on ${surface}`, async ($, on) => {
  on('session.model', () => ({ value: 'claude-opus-5-5' }) as never)
  on('session.cwd', () => ({ value: '/home/me/scripts' }) as never)
  on('session.usage', () =>
    ({
      value: {
        startedAt: 0,
        context: { window: 200000, percent: 42.7 },
        rateLimits: [
          { kind: 'five_hour', percentUsed: 15 },
          { kind: 'seven_day', percentUsed: 99.9 },
        ],
      },
    }) as never,
  )
  on('process.run', (_, e) =>
    ({
      value: {
        exitCode: 0,
        stdout: e.argv[0] === 'git' ? status('# branch.ab +1 -0', '? new.txt', '1 .M N... 100644 100644 100644 a b f.rs') : 'kitt\n',
        stderr: '',
      },
    }) as never,
  )
  on('session.start', (_, e) => ({ cwd: e.cwd }) as never)
  await $.session.start({ cwd: '/home/me/scripts', surface: 'terminal', isInteractive: true } as never)

  const ui = await $.ui.mount({ ...STRIP, surface })
  const top = (await ui.find({ type: 'Text', text: /Opus/ }))?.text
  expect(top).toContain('[Opus 5.5]   |   🖥')
  expect(top).toContain('   |   📁 scripts   |    main !?⇡   |   v')
  expect((await ui.find({ type: 'Text', text: /^ctx:/ }))?.text).toBe('ctx:▓▓▓▓░░░░░░42%')
  expect((await ui.find({ type: 'Text', text: /^5h:/ }))?.text).toBe('5h:▓░░░░░░░░░15%')
  expect((await ui.find({ type: 'Text', text: /^7d:/ }))?.text).toBe('7d:▓▓▓▓▓▓▓▓▓░99%')
  const rule = (await ui.find({ type: 'Text', text: /^─+$/ }))?.text
  expect(rule).toBe(surface === 'terminal' ? '─'.repeat(100) : undefined)
  // The monospaced face, for the desktop app.
  expect((await ui.find({ type: 'Text', text: /^ctx:/ }))?.props.mono).toBe(true)
  // The desktop app gets a rounded green outline; the terminal draws the rule instead.
  const box = (await ui.find({ type: 'Box' }))?.props
  expect(box?.backgroundColor).toBe('#000A00')
  expect(box?.borderStyle).toBe(surface === 'terminal' ? undefined : 'round')
  expect(box?.borderColor).toBe(surface === 'terminal' ? undefined : '#1AFF12')
  await ui.unmount()
})
}
