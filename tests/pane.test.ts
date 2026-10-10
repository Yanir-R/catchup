import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'catchup',
  component: 'Pane' as const,
  requestId: 'catchup',
  props: { title: 'Catch-up', isFocused: false, bodyColumns: 60, placement: 'inline', scroll: {} } as never,
}

test('the pane draws in its idle state on every surface, with a Run again button', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ key: 'again' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /brief me/ })).toBeDefined()
    await ui.unmount()
  }
})

import { mock } from 'claude-code/testing'

import { agent, user } from './helpers'

const MODEL_ANSWER = JSON.stringify({
  headline: 'The build is ready.',
  decisions: [{ ask: 'Which database should I use?', kind: 'decide', options: ['SQLite', 'Postgres'], recommend: 'Postgres', ifIgnored: null, src: [2] }],
  failed: [],
  done: [{ text: 'Built the parser.', proof: '12 tests pass', src: [2] }],
  running: [],
  notChecked: [],
  decided: [],
  next: null,
})

const USAGE = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

test('with a real summary, the buttons do what they say: handled items hide, sections toggle, only Reply fills the box', async ($, on) => {
  const messages = [user('Build it.'), agent('Which database should I use?\n1. SQLite\n2. Postgres (Recommended)\nBuilt the parser, 12 tests pass.')]
  const copies: string[] = []
  const fills: string[] = []

  const toasts: string[] = []

  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('session.messages', () => ({ value: messages }))
  on('model.complete', () => ({ value: { isAnswered: true as const, text: MODEL_ANSWER, usage: USAGE } }))
  on('ui.copy', (_$, e) => {
    copies.push(e.text)

    return { value: { isCopied: true as const } }
  })
  on('prompt.fill', (_$, e) => {
    fills.push(e.text)

    return { isFilled: true }
  })
  const clock = mock.clock(on)

  await $.command.run({ command: 'catchup', args: '' })
  await clock.advance(10)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const has = async (text: RegExp) => (await ui.find({ type: 'Text', text })) !== undefined

  expect(await has(/NEEDS YOU \(1\)/)).toBe(true)
  expect(await has(/The build is ready\./)).toBe(true)
  expect(await has(/Postgres ★/)).toBe(true)
  expect(await has(/DONE 1/)).toBe(true)
  expect(await has(/Built the parser/)).toBe(false)

  await ui.press({ key: 'expand' })
  expect(await has(/Built the parser/)).toBe(true)
  await ui.press({ key: 'expand' })
  expect(await has(/Built the parser/)).toBe(false)

  await ui.press({ key: 'handoff' })
  expect(copies).toHaveLength(1)
  expect(copies[0].startsWith('HANDOFF from a catch-up')).toBe(true)
  expect(fills).toEqual([])
  expect(toasts[toasts.length - 1]).toBe('The handoff is on the clipboard. Paste it into a new session.')

  await ui.press({ key: 'reply' })
  expect(fills).toHaveLength(1)
  expect(fills[0].startsWith('Answers to the catch-up')).toBe(true)
  expect(copies).toHaveLength(1)
  expect(toasts[toasts.length - 1].includes('prompt box')).toBe(true)

  await ui.press({ key: 'done:3' })
  expect(await has(/NEEDS YOU/)).toBe(false)
  expect(await ui.find({ key: 'reply' })).toBe(undefined)
  expect(await ui.find({ key: 'restore' })).toBeDefined()

  await ui.press({ key: 'restore' })
  expect(await has(/NEEDS YOU \(1\)/)).toBe(true)
  await ui.unmount()
})

test('the command reply does not repeat the plugin name, which the engine already adds', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.messages', () => ({ value: [user('Hi.'), agent('Hello.')] }))
  on('model.complete', () => ({ value: { isAnswered: true as const, text: MODEL_ANSWER, usage: USAGE } }))
  mock.clock(on)

  const out = await $.command.run({ command: 'catchup', args: '' })

  expect(out.text).toBe('summary pane opened.')
  expect(out.text?.includes('catchup')).toBe(false)
})

test('the header says "1 message", not "1 messages"', async ($, on) => {
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.messages', () => ({ value: [user('Hi.'), agent('Hello there.')] }))
  on('model.complete', () => ({ value: { isAnswered: true as const, text: MODEL_ANSWER, usage: USAGE } }))
  const clock = mock.clock(on)

  await $.command.run({ command: 'catchup', args: '' })
  await clock.advance(10)

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /Catch-up: 1 message since your last message/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /1 messages/ })).toBe(undefined)
  await ui.unmount()
})
