import { expect, test } from 'claude-code/testing'

import { EMPTY, dropAnswered, mergeSummaries, parseSummary, textsOf } from '../hooks/lib/schema'

const good = {
  headline: 'The build passed.',
  decisions: [{ ask: 'Pick a database.', options: ['SQLite', 'Postgres'], recommend: null, ifIgnored: null, src: [3] }],
  failed: [],
  done: [{ text: 'Added the parser.', proof: '12 tests pass', src: [2] }],
  running: [{ text: 'The deploy runs.', src: [4] }],
  notChecked: [],
}

test('a valid answer is read, also inside a code fence', () => {
  const plain = parseSummary(JSON.stringify(good), 1, 4)
  const fenced = parseSummary('```json\n' + JSON.stringify(good) + '\n```', 1, 4)

  expect(plain.ok && plain.summary.headline).toBe('The build passed.')
  expect(fenced.ok).toBe(true)
})

test('text with no object, broken JSON and a missing headline are errors', () => {
  expect(parseSummary('no json here', 1, 4).ok).toBe(false)
  expect(parseSummary('{"headline": ', 1, 4).ok).toBe(false)
  expect(parseSummary('{"decisions": []}', 1, 4).ok).toBe(false)
  expect(parseSummary('[1,2]', 1, 4).ok).toBe(false)
})

test('a source outside the shown range is dropped as invented', () => {
  const out = parseSummary(JSON.stringify({ ...good, running: [{ text: 'x', src: [4, 99, 0, 2.5, '3'] }] }), 1, 4)

  expect(out.ok && out.summary.running[0].src).toEqual([4])
})

test('a done item with no proof, or no valid source, becomes not checked', () => {
  const noProof = { ...good, done: [{ text: 'Fixed it.', proof: null, src: [2] }] }
  const noSource = { ...good, done: [{ text: 'Fixed it.', proof: '5 pass', src: [99] }] }

  for (const input of [noProof, noSource]) {
    const out = parseSummary(JSON.stringify(input), 1, 4)

    expect(out.ok && out.summary.done).toHaveLength(0)
    expect(out.ok && out.summary.notChecked.map(n => n.text)).toEqual(['Fixed it.'])
  }
})

test('missing lists become empty and wrong types are ignored', () => {
  const out = parseSummary('{"headline":"Ok.","decisions":"no","failed":[1,"x",null]}', 1, 4)

  expect(out.ok && out.summary.decisions).toEqual([])
  expect(out.ok && out.summary.failed).toEqual([])
})

test('merging keeps every item once, oldest first', () => {
  const a = parseSummary(JSON.stringify(good), 1, 4)
  const b = parseSummary(JSON.stringify({ ...good, done: [{ text: 'added the parser.', proof: 'x', src: [2] }, { text: 'Wrote docs.', proof: 'y', src: [3] }] }), 1, 4)

  if (!a.ok || !b.ok) {
    throw new Error('setup failed')
  }

  const merged = mergeSummaries([a.summary, b.summary], 'All done.')

  expect(merged.headline).toBe('All done.')
  expect(merged.done.map(d => d.text)).toEqual(['Added the parser.', 'Wrote docs.'])
  expect(textsOf(merged).includes('All done.')).toBe(true)
})

test('a failure is open unless the model says it is fixed', () => {
  const out = parseSummary(JSON.stringify({ ...good, failed: [{ text: 'A.', fixed: true, src: [1] }, { text: 'B.', src: [2] }, { text: 'C.', fixed: 'yes', src: [3] }] }), 1, 4)

  expect(out.ok && out.summary.failed.map(f => f.fixed)).toEqual([true, false, false])
})

test('a decided item must point at a message of the person', () => {
  const input = JSON.stringify({ ...good, decided: [{ text: 'Use SQLite.', src: [2] }, { text: 'Use tabs.', src: [3] }, { text: 'No source.', src: [] }], next: ' Run the tests. ' })
  const out = parseSummary(input, 1, 4, new Set([2]))

  expect(out.ok && out.summary.decided).toEqual([{ text: 'Use SQLite.', src: [2] }])
  expect(out.ok && out.summary.next).toBe('Run the tests.')
  expect(out.ok && out.notes.length).toBeGreaterThan(0)
})

test('next is null when the model gives none', () => {
  const out = parseSummary(JSON.stringify(good), 1, 4)

  expect(out.ok && out.summary.next).toBe(null)
  expect(out.ok && out.summary.decided).toEqual([])
})

test('an open decision whose sources are all cited by a decided item is dropped', () => {
  const ask = (text: string, src: number[]) => ({ ask: text, options: [], recommend: null, ifIgnored: null, src })
  const summary = {
    ...EMPTY,
    headline: 'x',
    decisions: [ask('Which sources show?', [2]), ask('Publish the mod?', [3]), ask('No source.', []), ask('Mixed sources.', [2, 3])],
    decided: [{ text: 'Show sources as numbers.', src: [2] }],
  }

  expect(dropAnswered(summary).decisions.map(d => d.ask)).toEqual(['Publish the mod?', 'No source.', 'Mixed sources.'])
})

test('a decision with no source, or citing only the person\'s own messages, is dropped when read', () => {
  const ask = (text: string, src: number[]) => ({ ask: text, options: [], recommend: null, ifIgnored: null, src })
  const input = JSON.stringify({ ...good, decisions: [ask('From an agent.', [3]), ask('No source.', []), ask('Pasted by the person.', [2]), ask('Mixed.', [2, 3])] })
  const out = parseSummary(input, 1, 4, new Set([2]))

  expect(out.ok && out.summary.decisions.map(d => d.ask)).toEqual(['From an agent.', 'Mixed.'])
})

test('a letter or number the model put before an option is removed, so code adds the only one', () => {
  const input = JSON.stringify({ ...good, decisions: [{ ask: 'Publish?', options: ['A) Publish now', 'B) Keep it private', '(c) Wait', '1. Later', 'Plain'], recommend: null, ifIgnored: null, src: [3] }] })
  const out = parseSummary(input, 1, 4)

  expect(out.ok && out.summary.decisions[0].options).toEqual(['Publish now', 'Keep it private', 'Wait', 'Later', 'Plain'])
})


test('a decision with no source is dropped even when no list of the person\'s messages is given', () => {
  const input = JSON.stringify({ ...good, decisions: [{ ask: 'From an agent.', options: [], recommend: null, ifIgnored: null, src: [3] }, { ask: 'No source.', options: [], recommend: null, ifIgnored: null, src: [] }] })
  const out = parseSummary(input, 1, 4)

  expect(out.ok && out.summary.decisions.map(d => d.ask)).toEqual(['From an agent.'])
})

test('a decision is a question to decide unless the model says it is a task', () => {
  const input = JSON.stringify({ ...good, decisions: [{ ask: 'A?', src: [3] }, { ask: 'B.', kind: 'do', src: [3] }, { ask: 'C?', kind: 'whatever', src: [3] }] })
  const out = parseSummary(input, 1, 4)

  expect(out.ok && out.summary.decisions.map(d => d.kind)).toEqual(['decide', 'do', 'decide'])
})

test('markdown the model wrote is removed from every text field', () => {
  const input = JSON.stringify({ ...good, headline: 'Press **Copy** now.', next: 'Then **Reply**.', done: [{ text: 'Did **it**.', proof: '`__x__` ran', src: [2] }] })
  const out = parseSummary(input, 1, 4)

  expect(out.ok && out.summary.headline).toBe('Press Copy now.')
  expect(out.ok && out.summary.next).toBe('Then Reply.')
  expect(out.ok && out.summary.done[0]).toEqual({ text: 'Did it.', proof: '`__x__` ran', src: [2] })
})
