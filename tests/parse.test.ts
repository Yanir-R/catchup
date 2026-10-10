import { expect, test } from 'claude-code/testing'

import { matchPhrase, parseArgs } from '../hooks/lib/parse'

test('whole-prompt phrases match', () => {
  expect(matchPhrase('brief me')).toEqual({ n: null })
  expect(matchPhrase('  Catch up  ')).toEqual({ n: null })
  expect(matchPhrase('catchup 25')).toEqual({ n: 25 })
  expect(matchPhrase('catch up on the last 5 messages')).toEqual({ n: 5 })
  expect(matchPhrase('/catchup 3')).toEqual({ n: 3 })
  expect(matchPhrase('what did I miss?')).toEqual({ n: null })
})

test('a sentence that only contains the words does not match', () => {
  expect(matchPhrase('brief me about the auth bug')).toBe(null)
  expect(matchPhrase('please brief me')).toBe(null)
  expect(matchPhrase('catchup is a good name for the mod')).toBe(null)
  expect(matchPhrase('summarize')).toBe(null)
})

test('counts are clamped to 1..500', () => {
  expect(matchPhrase('catchup 0')).toEqual({ n: 1 })
  expect(matchPhrase('catchup 9999')).toEqual({ n: 500 })
})

test('command arguments', () => {
  expect(parseArgs('')).toEqual({ n: null })
  expect(parseArgs(' 12 ')).toEqual({ n: 12 })
  expect(parseArgs('7 messages')).toEqual({ n: 7 })
  expect('error' in parseArgs('abc')).toBe(true)
})
