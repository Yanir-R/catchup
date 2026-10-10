import { expect, test } from 'claude-code/testing'

import { cleanOption, optionsText, recommendedIndex, stripLead } from '../hooks/lib/options'

test('an option loses markdown, a description after a dash, a trailing period and a recommendation mark', () => {
  expect(cleanOption('**Pane** — opens a pane')).toEqual({ label: 'Pane', isMarked: false })
  expect(cleanOption('Postgres (Recommended)')).toEqual({ label: 'Postgres', isMarked: true })
  expect(cleanOption('Keep it private ★')).toEqual({ label: 'Keep it private', isMarked: true })
  expect(cleanOption('Keep it private ⭐ Recommended')).toEqual({ label: 'Keep it private', isMarked: true })
  expect(cleanOption('Use a pane.')).toEqual({ label: 'Use a pane', isMarked: false })
  expect(cleanOption('Fast: runs in one pass')).toEqual({ label: 'Fast', isMarked: false })
})

test('a recommendation names its option by letter, number or words', () => {
  const options = ['SQLite', 'Postgres', 'Files']

  expect(recommendedIndex(options, 'B')).toBe(1)
  expect(recommendedIndex(options, 'option b')).toBe(1)
  expect(recommendedIndex(options, 'Option 3')).toBe(2)
  expect(recommendedIndex(options, '1')).toBe(0)
  expect(recommendedIndex(options, 'Postgres')).toBe(1)
  expect(recommendedIndex(options, 'I would go with Postgres here.')).toBe(1)
})

test('no recommendation, no options, an out-of-range pick or a sentence naming two options give no star', () => {
  const options = ['SQLite', 'Postgres']

  expect(recommendedIndex(options, null)).toBe(-1)
  expect(recommendedIndex([], 'B')).toBe(-1)
  expect(recommendedIndex(options, 'F')).toBe(-1)
  expect(recommendedIndex(options, '9')).toBe(-1)
  expect(recommendedIndex(options, 'SQLite is simple but Postgres scales.')).toBe(-1)
  expect(recommendedIndex(options, 'Keep it as it is.')).toBe(-1)
})

test('the recommended option carries a star in the options line', () => {
  expect(optionsText(['SQLite', 'Postgres'], 'B')).toBe('A) SQLite  B) Postgres ★')
  expect(optionsText(['SQLite', 'Postgres'], null)).toBe('A) SQLite  B) Postgres')
  expect(optionsText(['`x`'], null, t => t.toUpperCase())).toBe('A) `X`')
})

test('a letter in front of an option is never doubled', () => {
  expect(optionsText(['A) Publish now', 'B) Keep it private'], null)).toBe('A) Publish now  B) Keep it private')
  expect(optionsText(['(A) Publish now', 'b. Keep it private'], null)).toBe('A) Publish now  B) Keep it private')
  expect(optionsText(['Publish now', 'Keep it private'], null)).toBe('A) Publish now  B) Keep it private')
})

test('only a real marker is stripped, not words that start like one', () => {
  expect(stripLead('A) Publish')).toBe('Publish')
  expect(stripLead('B: Keep')).toBe('Keep')
  expect(stripLead('UI: dark mode')).toBe('UI: dark mode')
  expect(stripLead('2FA setup')).toBe('2FA setup')
  expect(stripLead('A plan')).toBe('A plan')
})

test('a recommendation still finds its option when the option has a letter in front', () => {
  expect(recommendedIndex(['A) Publish now', 'B) Keep it private'], 'B) Keep it private')).toBe(1)
  expect(recommendedIndex(['A) Publish now', 'B) Keep it private'], 'Keep it private')).toBe(1)
})
