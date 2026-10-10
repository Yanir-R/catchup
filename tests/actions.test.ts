import { expect, test } from 'claude-code/testing'

import { deliveryFor } from '../hooks/lib/actions'
import type { Button } from '../hooks/lib/actions'

const v = { text: 'SUMMARY', handoff: 'HANDOFF', reply: 'REPLY' }

test('Copy and Copy handoff go to the clipboard and never to the prompt box', () => {
  expect(deliveryFor('copy', v)).toEqual({ to: 'clipboard', text: 'SUMMARY', done: 'The summary is on the clipboard.' })
  expect(deliveryFor('handoff', v)).toEqual({ to: 'clipboard', text: 'HANDOFF', done: 'The handoff is on the clipboard. Paste it into a new session.' })
})

test('the reply template is the only button that fills the prompt box', () => {
  const buttons: Button[] = ['copy', 'handoff', 'reply']
  const toBox = buttons.filter(b => deliveryFor(b, v).to === 'prompt-box')

  expect(toBox).toEqual(['reply'])
  expect(deliveryFor('reply', v)).toEqual({ to: 'prompt-box', text: 'REPLY' })
})

test('each button sends its own text, not another button\'s', () => {
  expect(deliveryFor('handoff', v).text).toBe('HANDOFF')
  expect(deliveryFor('reply', v).text).toBe('REPLY')
  expect(deliveryFor('copy', v).text).toBe('SUMMARY')
  expect(deliveryFor('handoff', {}).text).toBe('')
})
