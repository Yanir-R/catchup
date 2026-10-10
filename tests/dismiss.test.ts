import { expect, test } from 'claude-code/testing'

import { dismissibleCount, isDismissed, remember, withoutDismissed } from '../hooks/lib/dismiss'
import { EMPTY } from '../hooks/lib/schema'
import type { Summary } from '../hooks/lib/schema'

const ask = (text: string, src: number[] = []) => ({ ask: text, options: [], recommend: null, ifIgnored: null, src })

const summary: Summary = {
  ...EMPTY,
  headline: 'x',
  decisions: [ask('Test the new catchup build live.', [189, 195]), ask('Decide whether to publish the mod.', [252])],
  failed: [
    { text: 'Copy handoff seemed to paste into the input box.', fixed: false, src: [369] },
    { text: 'The pane cut the summary.', fixed: true, src: [172] },
  ],
  notChecked: [{ text: 'Colors and wrapped buttons were not seen.', why: null, src: [313] }],
}

test('an item matches when most of its words match, so a reworded item stays hidden', () => {
  const handled = [{ text: 'Test the new catchup build live.', src: [189, 195] }]

  expect(isDismissed({ text: 'Test the new catchup build live in a real session.', src: [189, 195] }, handled)).toBe(true)
  expect(isDismissed({ text: 'Test the catchup build live', src: [] }, handled)).toBe(true)
})

test('a different item is not hidden', () => {
  const handled = [{ text: 'Test the new catchup build live.', src: [189] }]

  expect(isDismissed({ text: 'Decide whether to publish the mod.', src: [252] }, handled)).toBe(false)
  expect(isDismissed({ text: 'Send the pane line to debug the count.', src: [189] }, handled)).toBe(false)
})

test('the same messages and some shared words also match', () => {
  const handled = [{ text: 'Check the live pane output', src: [10, 11] }]

  expect(isDismissed({ text: 'Look at the pane live', src: [11, 10] }, handled)).toBe(true)
  expect(isDismissed({ text: 'Look at the pane live', src: [12] }, handled)).toBe(false)
})

test('remembering the same item twice keeps one entry', () => {
  const once = remember([], { text: 'Publish the mod', src: [1] })

  expect(remember(once, { text: 'Publish the mod now', src: [1] })).toHaveLength(1)
  expect(remember(once, { text: 'Something else entirely', src: [2] })).toHaveLength(2)
})

test('handled questions, failures and unproven items are removed; fixed failures are not touched', () => {
  const handled = [
    { text: 'Test the new catchup build live.', src: [189] },
    { text: 'Copy handoff seemed to paste into the input box.', src: [369] },
    { text: 'Colors and wrapped buttons were not seen.', src: [313] },
    { text: 'The pane cut the summary.', src: [172] },
  ]
  const out = withoutDismissed(summary, handled)

  expect(out.decisions.map(d => d.ask)).toEqual(['Decide whether to publish the mod.'])
  expect(out.failed.map(f => f.text)).toEqual(['The pane cut the summary.'])
  expect(out.notChecked).toEqual([])
})

test('nothing handled leaves the summary as it is, and the count says how many can be handled', () => {
  expect(withoutDismissed(summary, [])).toBe(summary)
  expect(dismissibleCount(summary)).toBe(4)
  expect(dismissibleCount(withoutDismissed(summary, [{ text: 'Decide whether to publish the mod.', src: [252] }]))).toBe(3)
})

test('in the summary where ✓ was pressed, only the very same item is hidden, not a similar one beside it', () => {
  const task = { text: 'Check the check.sh type errors against the code.', src: [38, 41] }
  const similar = { text: 'The check.sh type errors were not checked against the code.', src: [38, 41] }
  const handled = [{ ...task, run: 7 }]

  expect(isDismissed(task, handled, 7)).toBe(true)
  expect(isDismissed(similar, handled, 7)).toBe(false)
})

test('in a later run, a reworded copy of a handled item is still hidden', () => {
  const handled = [{ text: 'Check the check.sh type errors against the code.', src: [38, 41], run: 7 }]

  expect(isDismissed({ text: 'Check the check.sh type errors against the code now.', src: [38, 41] }, handled, 8)).toBe(true)
})

test('a handled item is remembered with the summary it came from', () => {
  const list = remember([], { text: 'Publish the mod', src: [1], run: 5 })

  expect(list).toEqual([{ text: 'Publish the mod', src: [1], run: 5 }])
  expect(remember(list, { text: 'Publish the mod', src: [1], run: 5 })).toHaveLength(1)
})
