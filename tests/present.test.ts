import { expect, test } from 'claude-code/testing'

import { markSummary, present, textsFor } from '../hooks/lib/present'
import { EMPTY } from '../hooks/lib/schema'
import type { Summary } from '../hooks/lib/schema'

const ask = (text: string, src: number[], kind?: 'decide' | 'do') => ({ ask: text, options: ['Yes', 'No'], recommend: null, ifIgnored: null, src, kind })

const summary: Summary = {
  ...EMPTY,
  headline: 'The mod is built.',
  next: 'Try it.',
  decisions: [ask('Publish the mod?', [5]), ask('Test it live.', [6], 'do')],
  failed: [{ text: 'A test failed.', fixed: false, src: [7] }],
  done: [{ text: 'Built it.', proof: '133 pass', src: [8] }],
  notChecked: [{ text: 'The colors were not seen.', why: null, src: [9] }],
  decided: [{ text: 'Keep threshold 8.', src: [1] }],
}
const data = { summary, range: { first: 1, last: 9, agentMessages: 5 } }

test('compact by default shows what needs the reader and one line of counts for the rest', () => {
  const lines = present(data, [], false).lines.map(l => l.text)

  expect(lines.some(l => l.startsWith('NEEDS YOU'))).toBe(true)
  expect(lines.some(l => l.startsWith('FAILED'))).toBe(true)
  expect(lines.includes('DONE 1 · NOT CHECKED 1 · DECIDED 1')).toBe(true)
  expect(lines.some(l => l.startsWith('- Built it'))).toBe(false)
})

test('expanded shows every section', () => {
  const lines = present(data, [], true).lines.map(l => l.text)

  expect(lines.some(l => l.startsWith('DONE (1)'))).toBe(true)
  expect(lines.some(l => l.startsWith('NOT CHECKED (1)'))).toBe(true)
  expect(lines.some(l => l.startsWith('DECIDED (1)'))).toBe(true)
})

test('a handled item leaves the pane, the plain text, the handoff and the reply template, and is counted as hidden', () => {
  const handled = [{ text: 'Publish the mod?', src: [5] }]
  const shown = present(data, handled, true)
  const texts = textsFor(data, handled)

  expect(shown.hidden).toBe(1)
  expect(shown.lines.some(l => l.text.includes('Publish the mod?'))).toBe(false)

  for (const text of [texts.text, texts.handoff, texts.reply]) {
    expect(text.includes('Publish the mod?')).toBe(false)
  }
})

test('with no open question left, there is no reply template', () => {
  const handled = [{ text: 'Publish the mod?', src: [5] }]

  expect(textsFor(data, []).reply.includes('Publish the mod?')).toBe(true)
  expect(textsFor(data, handled).reply).toBe('')
})

test('the plain copy is always the full summary, even when the pane is compact', () => {
  expect(textsFor(data, []).text.includes('- Built it. Proof: 133 pass')).toBe(true)
})

test('marking happens once: a name missing from the source is marked, and drawing does not mark it again', () => {
  const marked = markSummary({ ...summary, headline: 'Edited `ghost.ts`.' }, 'only this text')
  const head = present({ summary: marked, range: data.range }, [], true).lines[0].text

  expect(marked.headline).toBe('Edited `ghost.ts` (?).')
  expect(head).toBe('Edited `ghost.ts` (?).')
})
