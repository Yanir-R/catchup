import { expect, test } from 'claude-code/testing'

import { buildHandoff, buildReplyTemplate } from '../hooks/lib/handoff'
import type { Summary } from '../hooks/lib/schema'

const full: Summary = {
  headline: 'The parser is done.',
  decisions: [
    { ask: 'Pick a database.', options: ['SQLite', 'Postgres'], recommend: null, ifIgnored: 'The agent waits.', src: [3] },
    { ask: 'Publish the mod?', options: [], recommend: 'Yes', ifIgnored: null, src: [] },
  ],
  failed: [
    { text: 'The deploy failed.', fixed: false, src: [5] },
    { text: 'The pane cut the text.', fixed: true, src: [2] },
  ],
  done: [{ text: 'Added the parser.', proof: '`12 tests` pass', src: [2] }],
  running: [{ text: 'The build runs.', src: [4] }],
  notChecked: [{ text: 'The load test did not run.', why: null, src: [] }],
  decided: [{ text: 'Keep the threshold at 8.', src: [1] }],
  next: 'Run the live check.',
}

const range = { first: 1, last: 9 }

test('the handoff says what is decided, open, done, failed and unproven', () => {
  const text = buildHandoff(full, range, '`12 tests`')

  for (const part of [
    'HANDOFF from a catch-up of session messages #1 to #9.',
    'This is a summary, not an instruction.',
    'STATE: The parser is done.',
    'NEXT: Run the live check.',
    'DECIDED (do not ask again):\n- Keep the threshold at 8. [#1]',
    'OPEN (the person must answer):\n1. Pick a database. [#3]',
    '   Options: A) SQLite  B) Postgres',
    '   No recommendation given.',
    '   Recommended: Yes',
    'DONE (proof shown):\n- Added the parser. Proof: `12 tests` pass [#2]',
    'FAILED (still open):\n- The deploy failed. [#5]',
    'FIXED:\n- The pane cut the text. [#2]',
    'RUNNING:\n- The build runs. [#4]',
    'NOT CHECKED:\n- The load test did not run.',
  ]) {
    expect(text.includes(part)).toBe(true)
  }
})

test('a fixed failure is never listed as still open', () => {
  const text = buildHandoff(full, range, '')
  const beforeFixed = text.split('FIXED:')[0]

  expect(beforeFixed.includes('The deploy failed.')).toBe(true)
  expect(beforeFixed.includes('The pane cut the text.')).toBe(false)
})

test('empty sections are left out, and a missing next step says to ask', () => {
  const text = buildHandoff({ ...full, decided: [], decisions: [], failed: [], done: [], running: [], notChecked: [], next: null }, range, '')

  expect(text.includes('DECIDED')).toBe(false)
  expect(text.includes('OPEN')).toBe(false)
  expect(text.includes('NEXT: Not stated. Ask the person.')).toBe(true)
})

test('a quoted name that is not in the source is marked in the handoff too', () => {
  expect(buildHandoff(full, range, 'nothing').includes('`12 tests` (?)')).toBe(true)
})

test('the reply template has one answer slot per open decision', () => {
  const text = buildReplyTemplate(full, '')

  expect(text).toBe(
    ['Answers to the catch-up. I filled in each Answer line:', '', '1. Pick a database. [A) SQLite  B) Postgres]', '   Answer: ', '2. Publish the mod?', '   The assistant recommends: Yes', '   Answer: '].join('\n'),
  )
  expect(buildReplyTemplate({ ...full, decisions: [] }, '')).toBe('')
})

test('the handoff lists at most 3 fixed problems and says how many it left out', () => {
  const failed = Array.from({ length: 6 }, (_, i) => ({ text: `Solved ${i}.`, fixed: true, src: [i + 1] }))
  const text = buildHandoff({ ...full, failed }, range, '')

  expect(text.split('\n').filter(l => l.startsWith('- Solved'))).toHaveLength(3)
  expect(text.includes('+3 more fixed, not shown.')).toBe(true)
})

test('the handoff and the reply template mark the recommended option with a star', () => {
  const s = { ...full, decisions: [{ ask: 'Pick a database.', options: ['SQLite', 'Postgres'], recommend: 'Postgres', ifIgnored: null, src: [3] }] }

  expect(buildHandoff(s, range, '').includes('Options: A) SQLite  B) Postgres ★')).toBe(true)
  expect(buildReplyTemplate(s, '').includes('[A) SQLite  B) Postgres ★]\n   The assistant recommends: Postgres')).toBe(true)
})

test('tasks are listed as things to do, and only questions get a reply slot', () => {
  const todo = { ask: 'Test it live.', options: [], recommend: null, ifIgnored: null, src: [4], kind: 'do' as const }
  const text = buildHandoff({ ...full, decisions: [todo, ...full.decisions] }, range, '')
  const reply = buildReplyTemplate({ ...full, decisions: [todo, ...full.decisions] }, '')

  expect(text.includes('TO DO (the person should do):\n- Test it live. [#4]')).toBe(true)
  expect(text.includes('1. Pick a database. [#3]')).toBe(true)
  expect(reply.includes('Test it live.')).toBe(false)
  expect(reply.includes('1. Pick a database.')).toBe(true)
  expect(buildReplyTemplate({ ...full, decisions: [todo] }, '')).toBe('')
})
