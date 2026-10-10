import { expect, test } from 'claude-code/testing'

import { issuesOf, longSentences, ungrounded, vagueProofs } from '../hooks/lib/check'

test('a quoted name that is not in the messages is found', () => {
  const source = '[#1] AGENT: edited `src/app.ts` and ran `npm test`'

  expect(ungrounded('Edited `src/app.ts`.', source)).toEqual([])
  expect(ungrounded('Edited `slice.t` and `src/app.ts`.', source)).toEqual(['slice.t'])
  expect(ungrounded('No quotes here.', source)).toEqual([])
})

test('sentences over 25 words are found', () => {
  const long = Array.from({ length: 30 }, () => 'word').join(' ') + '.'

  expect(longSentences(`Short one. ${long} Another short.`)).toHaveLength(1)
  expect(longSentences('Short one. Short two.')).toEqual([])
})

test('issues are written for the model to act on', () => {
  const issues = issuesOf(['Edited `ghost.ts`.', Array.from({ length: 30 }, () => 'w').join(' ') + '.'], 'nothing')

  expect(issues).toHaveLength(2)
  expect(issues[0].includes('ghost.ts')).toBe(true)
  expect(issues[1].includes('too long')).toBe(true)
})

test('a proof with no number, name or message is vague', () => {
  const done = [
    { text: 'Ran the breaks.', proof: 'Mutation runs listed in the messages' },
    { text: 'Tests pass.', proof: '81 pass 0 fail' },
    { text: 'Built it.', proof: 'the `plugin.json` file' },
    { text: 'Fixed it.', proof: 'shown in message #12' },
    { text: 'No proof field.', proof: null },
  ]
  const issues = vagueProofs(done)

  expect(issues).toHaveLength(1)
  expect(issues[0].includes('Ran the breaks.')).toBe(true)
})
