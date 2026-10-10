import { expect, test } from 'claude-code/testing'

import { ref } from '../hooks/lib/refs'

test('no number gives nothing, one or two are listed', () => {
  expect(ref([])).toBe('')
  expect(ref([7])).toBe(' [#7]')
  expect(ref([9, 4])).toBe(' [#4, #9]')
})

test('more than two become a range with a count', () => {
  expect(ref([189, 195, 198, 199, 201, 235])).toBe(' [#189–#235 · 6 msgs]')
  expect(ref([5, 3, 4])).toBe(' [#3–#5 · 3 msgs]')
})
