import { expect, test } from 'claude-code/testing'

import { render, toPlainText } from '../hooks/lib/render'
import type { Summary } from '../hooks/lib/schema'

const base: Summary = {
  headline: 'The parser is done.',
  decisions: [
    { ask: 'Pick a database.', options: ['SQLite', 'Postgres'], recommend: null, ifIgnored: 'The agent waits.', src: [3] },
    { ask: 'Publish the mod?', options: [], recommend: 'Yes', ifIgnored: null, src: [] },
  ],
  failed: [{ text: 'The deploy failed.', fixed: false, src: [5, 6] }],
  done: [{ text: 'Added the parser.', proof: '`12 tests` pass', src: [2] }],
  running: [],
  notChecked: [{ text: 'The load test did not run.', why: 'No result shown.', src: [4] }],
  decided: [{ text: 'Keep the threshold at 8.', src: [2] }],
  next: 'Run the live check.',
}

const texts = (s: Summary, source = '`12 tests`') => render(s, { first: 1, last: 6, agentMessages: 4 }, source).map(l => l.text)

test('the order and the labels are fixed', () => {
  const out = texts(base)
  const labels = out.filter(t => /^[A-Z ]+ \(\d+\)$/.test(t))

  expect(labels).toEqual(['NEEDS YOU (2)', 'FAILED (1)', 'DONE (1)', 'NOT CHECKED (1)', 'DECIDED (1)'])
})

test('sources are shown as message numbers', () => {
  const out = texts(base).join('\n')

  expect(out.includes('Pick a database. [#3]')).toBe(true)
  expect(out.includes('The deploy failed. [#5, #6]')).toBe(true)
  expect(out.includes('4 new messages · #1 to #6')).toBe(true)
})

test('a decision shows its options, and says when nobody recommended one', () => {
  const out = texts(base).join('\n')

  expect(out.includes('Options: A) SQLite  B) Postgres')).toBe(true)
  expect(out.includes('No recommendation given.')).toBe(true)
  expect(out.includes('Recommended: Yes')).toBe(true)
  expect(out.includes('If ignored: The agent waits.')).toBe(true)
})

test('a quoted name that is not in the source is marked', () => {
  const out = texts(base, 'nothing quoted here').join('\n')

  expect(out.includes('`12 tests` (?)')).toBe(true)
})

test('long lists are capped and say how many are left', () => {
  const many = { ...base, failed: Array.from({ length: 8 }, (_, i) => ({ text: `Failure ${i}.`, fixed: false, src: [i + 1] })) }
  const out = texts(many)

  expect(out.filter(t => t.startsWith('- Failure'))).toHaveLength(5)
  expect(out.includes('+3 more not shown')).toBe(true)
})

test('empty sections are left out and plain text keeps the layout', () => {
  const out = texts({ ...base, decisions: [], failed: [], done: [], notChecked: [], decided: [], next: null })

  expect(out).toHaveLength(2)
  expect(toPlainText(render(base, { first: 1, last: 6, agentMessages: 1 }, '')).includes('   Options:')).toBe(true)
})

test('decisions are never cut, even when there are many', () => {
  const decisions = Array.from({ length: 9 }, (_, i) => ({ ask: `Decision ${i}?`, options: [], recommend: null, ifIgnored: null, src: [i + 1] }))
  const out = texts({ ...base, decisions })

  expect(out.filter(t => /^\d+\. Decision/.test(t))).toHaveLength(9)
  expect(out.some(t => t.includes('more not shown') && t.startsWith('+') && out.indexOf(t) < out.indexOf('FAILED (1)'))).toBe(false)
})

test('a solved failure is listed as fixed, not as failed', () => {
  const out = texts({ ...base, failed: [{ text: 'The pane cut the text.', fixed: true, src: [3] }, { text: 'The deploy failed.', fixed: false, src: [5] }] })

  expect(out.includes('FAILED (1)')).toBe(true)
  expect(out.includes('FIXED (1)')).toBe(true)
  expect(out.includes('- The pane cut the text. [#3]')).toBe(true)
})

test('a done item that ends with a period does not get two', () => {
  const out = texts({ ...base, done: [{ text: 'Added the parser.', proof: '12 tests pass', src: [2] }] }).join('\n')

  expect(out.includes('..')).toBe(false)
  expect(out.includes('- Added the parser. Proof: 12 tests pass [#2]')).toBe(true)
})

test('the next step and the settled choices are shown', () => {
  const out = texts(base)

  expect(out.includes('Next: Run the live check.')).toBe(true)
  expect(out.includes('- Keep the threshold at 8. [#2]')).toBe(true)
})

test('fixed problems are capped at 3 so they do not bury what needs the reader', () => {
  const failed = Array.from({ length: 8 }, (_, i) => ({ text: `Solved ${i}.`, fixed: true, src: [i + 1] }))
  const out = texts({ ...base, failed })

  expect(out.filter(t => t.startsWith('- Solved'))).toHaveLength(3)
  expect(out.includes('FIXED (8)')).toBe(true)
  expect(out.includes('+5 more not shown')).toBe(true)
})

test('every line of a section carries its section, so the pane can color it', () => {
  const lines = render(base, { first: 1, last: 6, agentMessages: 4 }, '`12 tests`')
  const sectionsOf = (label: string) => {
    const i = lines.findIndex(l => l.tone === 'label' && l.text.startsWith(label))

    return lines.slice(i, i + 3).map(l => l.section)
  }

  expect(sectionsOf('NEEDS YOU').every(s => s === 'needs')).toBe(true)
  expect(sectionsOf('FAILED')[0]).toBe('failed')
  expect(lines.find(l => l.text.startsWith('Next:'))?.section).toBe('next')
  expect(lines[0].section).toBe(undefined)
})

test('the recommended option gets a star and the recommendation is drawn as its own highlighted line', () => {
  const summary = { ...base, decisions: [{ ask: 'Pick a database.', options: ['SQLite', 'Postgres'], recommend: 'Postgres', ifIgnored: null, src: [3] }] }
  const lines = render(summary, { first: 1, last: 6, agentMessages: 4 }, '')

  expect(lines.some(l => l.text === 'Options: A) SQLite  B) Postgres ★')).toBe(true)
  expect(lines.find(l => l.tone === 'rec')?.text).toBe('★ Recommended: Postgres')
  expect(lines.some(l => l.text === 'No recommendation given.')).toBe(false)
})

test('plain text keeps the recommendation line indented under its question', () => {
  const summary = { ...base, decisions: [{ ask: 'Pick.', options: [], recommend: 'Yes', ifIgnored: null, src: [] }] }

  expect(toPlainText(render(summary, { first: 1, last: 2, agentMessages: 1 }, '')).includes('\n   ★ Recommended: Yes')).toBe(true)
})

test('a task is drawn with a checkbox and no options; questions are numbered among themselves', () => {
  const summary = {
    ...base,
    decisions: [
      { ask: 'Test it live.', options: [], recommend: null, ifIgnored: null, src: [1], kind: 'do' as const },
      { ask: 'Pick a database.', options: ['A', 'B'], recommend: null, ifIgnored: null, src: [2] },
      { ask: 'Publish?', options: [], recommend: null, ifIgnored: null, src: [3], kind: 'decide' as const },
    ],
  }
  const out = texts(summary)

  expect(out.includes('1. Pick a database. [#2]')).toBe(true)
  expect(out.includes('2. Publish? [#3]')).toBe(true)
  expect(out.includes('☐ Test it live. [#1]')).toBe(true)
  expect(out.indexOf('☐ Test it live. [#1]')).toBeGreaterThan(out.indexOf('2. Publish? [#3]'))
  expect(out.filter(t => t === 'No recommendation given.')).toHaveLength(2)
})

test('open items carry what a button needs to mark them handled; other items do not', () => {
  const lines = render(base, { first: 1, last: 6, agentMessages: 4 }, '')
  const withButton = lines.filter(l => l.dismiss !== undefined).map(l => l.dismiss?.text)

  expect(withButton).toEqual(['Pick a database.', 'Publish the mod?', 'The deploy failed.', 'The load test did not run.'])
  expect(lines.find(l => l.text.startsWith('- Added the parser'))?.dismiss).toBe(undefined)
  expect(lines.find(l => l.text.startsWith('- Keep the threshold'))?.dismiss).toBe(undefined)
})

test('a long chain of sources is shown as a range with a count', () => {
  const summary = { ...base, failed: [{ text: 'It broke.', fixed: false, src: [189, 195, 198, 199, 201, 235] }] }

  expect(texts(summary).includes('- It broke. [#189–#235 · 6 msgs]')).toBe(true)
})

test('compact mode draws what needs the reader in full and counts the rest', () => {
  const out = render(base, { first: 1, last: 6, agentMessages: 4 }, '', { expanded: false }).map(l => l.text)

  expect(out.some(l => l.startsWith('NEEDS YOU'))).toBe(true)
  expect(out.some(l => l.startsWith('FAILED'))).toBe(true)
  expect(out.includes('DONE 1 · NOT CHECKED 1 · DECIDED 1')).toBe(true)
  expect(out.some(l => l.startsWith('NOT CHECKED ('))).toBe(false)
})

test('compact mode with nothing else to count adds no counts line', () => {
  const out = render({ ...base, done: [], notChecked: [], decided: [] }, { first: 1, last: 6, agentMessages: 4 }, '', { expanded: false }).map(l => l.text)

  expect(out.some(l => /^[A-Z ]+ \d+( · )?/.test(l) && !l.includes('('))).toBe(false)
})
