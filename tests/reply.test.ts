import { expect, test } from 'claude-code/testing'

import { placeReply } from '../hooks/lib/reply'
import type { ReplyIo } from '../hooks/lib/reply'

function fake(box: string, canFill: boolean, canCopy = true) {
  const calls = { fills: [] as Array<{ text: string; mode: string }>, copies: [] as string[], toasts: [] as string[], submits: 0 }
  const io: ReplyIo & { submit?: () => void } = {
    read: async () => ({ text: box }),
    fill: async input => {
      calls.fills.push(input)

      return { isFilled: canFill }
    },
    copy: async text => {
      calls.copies.push(text)

      return { isCopied: canCopy }
    },
    toast: message => calls.toasts.push(message),
  }

  return { io, calls }
}

const TEMPLATE = 'Answers to the catch-up.\n\n1. Pick one? [A) x  B) y]\n   Answer: '

test('an empty box is filled with the full text, to be edited in place', async () => {
  const { io, calls } = fake('', true)

  expect(await placeReply(io, TEMPLATE)).toBe('filled')
  expect(calls.fills).toEqual([{ text: TEMPLATE, mode: 'replace' }])
  expect(calls.copies).toEqual([])
  expect(calls.toasts[0].includes('prompt box')).toBe(true)
})

test('nothing is sent: the box is filled and the person presses Enter', async () => {
  const { io, calls } = fake('', true)
  await placeReply(io, TEMPLATE)

  // The only effects are a read, one fill and one toast. There is no submit in the interface at all.
  expect(Object.keys(io).sort()).toEqual(['copy', 'fill', 'read', 'toast'])
  expect(calls.submits).toBe(0)
  expect(calls.toasts[0].includes('press Enter')).toBe(true)
})

test('a draft the person already typed is kept; the template goes after it', async () => {
  const { io, calls } = fake('half a thought', true)
  await placeReply(io, TEMPLATE)

  expect(calls.fills).toEqual([{ text: `\n\n${TEMPLATE}`, mode: 'append' }])
})

test('a blank draft counts as empty', async () => {
  const { io, calls } = fake('  \n ', true)
  await placeReply(io, TEMPLATE)

  expect(calls.fills[0].mode).toBe('replace')
})

test('when the box cannot take it, the text goes to the clipboard and the person is told', async () => {
  const { io, calls } = fake('', false)

  expect(await placeReply(io, TEMPLATE)).toBe('copied')
  expect(calls.copies).toEqual([TEMPLATE])
  expect(calls.toasts[0].includes('clipboard')).toBe(true)
})

test('when neither works, it says so', async () => {
  const { io, calls } = fake('', false, false)

  expect(await placeReply(io, TEMPLATE)).toBe('failed')
  expect(calls.toasts).toEqual(['Could not place the template.'])
})
