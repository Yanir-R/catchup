import { expect, test } from 'claude-code/testing'

import { unmarkdown } from '../hooks/lib/text'

test('bold, underline emphasis, links and headings lose their markers', () => {
  expect(unmarkdown('Press **Copy handoff** and check. Then press **Reply template**.')).toBe('Press Copy handoff and check. Then press Reply template.')
  expect(unmarkdown('Use __strong__ words')).toBe('Use strong words')
  expect(unmarkdown('Use *this* word')).toBe('Use this word')
  expect(unmarkdown('See [the docs](https://example.com/x) now')).toBe('See the docs now')
  expect(unmarkdown('## Heading')).toBe('Heading')
})

test('text in backticks is never changed', () => {
  expect(unmarkdown('Run `__init__` and `**x**` and `a * b * c`.')).toBe('Run `__init__` and `**x**` and `a * b * c`.')
  expect(unmarkdown('**Bold** then `__init__`')).toBe('Bold then `__init__`')
})

test('ordinary stars, message numbers and sums are kept', () => {
  expect(unmarkdown('2 * 3 * 4 is 24')).toBe('2 * 3 * 4 is 24')
  expect(unmarkdown('See [#12] and [#13, #14]')).toBe('See [#12] and [#13, #14]')
  expect(unmarkdown('No markup here.')).toBe('No markup here.')
})
