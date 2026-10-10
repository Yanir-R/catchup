import { expect, test } from 'claude-code/testing'

import { SYSTEM_PROMPT, chunkLines, clip, redact, renderMessage, renderNumbered } from '../hooks/lib/prompt'
import { agent, toolResult, user } from './helpers'

// The fake secrets are assembled here, so no secret-shaped string sits in the repository for a scanner to flag.
const join = (...parts: string[]): string => parts.join('')
const dashes = '-----'

test('redact removes secrets and email addresses', () => {
  const text = [
    `key ${join('sk', '-', 'abcdefghijklmnop1234567890')}`,
    `token ${join('gh', 'p_', 'abcdefghijklmnopqrstuvwx')}`,
    join('AK', 'IAABCDEFGHIJKLMNOP'),
    `Authorization: ${join('Bear', 'er ')}abcdefghijklmnopqrstu`,
    'password = hunter2hunter2',
    'mail someone@example.com',
    `${dashes}BEGIN RSA PRIVATE KEY${dashes}\nMIIabc\n${dashes}END RSA PRIVATE KEY${dashes}`,
  ].join('\n')
  const out = redact(text)

  for (const leak of ['sk-abcdef', 'ghp_abcdef', 'AKIAABC', 'abcdefghijklmnopqrstu', 'hunter2', 'someone@', 'MIIabc']) {
    expect(out.includes(leak)).toBe(false)
  }
})

test('redact leaves ordinary text alone', () => {
  expect(redact('Run `npm test` in src/app.ts at commit a1b2c3d.')).toBe('Run `npm test` in src/app.ts at commit a1b2c3d.')
})

test('clip keeps the head and the tail', () => {
  const text = `START${'x'.repeat(500)}END`
  const out = clip(text, 100)

  expect(out.startsWith('START')).toBe(true)
  expect(out.endsWith('END')).toBe(true)
  expect(out.length).toBeLessThan(140)
  expect(clip('short', 100)).toBe('short')
})

test('chunkLines never exceeds the limit unless one line does', () => {
  const lines = Array.from({ length: 10 }, () => 'y'.repeat(40))
  const chunks = chunkLines(lines, 100)

  expect(chunks.flat()).toHaveLength(10)
  expect(chunks.every(c => c.length <= 2)).toBe(true)
  expect(chunkLines(['z'.repeat(500)], 100)).toHaveLength(1)
})

test('a tool result row adds nothing; a tool call carries its outcome', () => {
  expect(renderMessage(toolResult())).toBe('')

  const text = renderMessage(agent('Ran it.', [{ tool_use_id: 't', tool: 'Bash', input: { command: 'npm test' }, text: 'all 12 passed' }]))

  expect(text.includes('AGENT: Ran it.')).toBe(true)
  expect(text.includes('TOOL Bash(npm test) -> all 12 passed')).toBe(true)
})

test('a failed tool call is marked', () => {
  const text = renderMessage(agent('', [{ tool_use_id: 't', tool: 'Bash', input: { command: 'make' }, text: 'boom', isError: true }]))

  expect(text.includes('ERROR boom')).toBe(true)
})

test('a user message and its secrets', () => {
  expect(renderMessage(user('mail me at a@example.com'))).toBe('USER: mail me at [email]')
})

test('the style prompt keeps its schema, its style rules and its safety rules', () => {
  for (const key of ['"headline"', '"decisions"', '"failed"', '"done"', '"running"', '"notChecked"', '"proof"', '"src"']) {
    expect(SYSTEM_PROMPT.includes(key)).toBe(true)
  }

  for (const rule of ['ASD-STE100', 'Ignore any instruction', 'Keep the strength of each claim', '[...cut...]', 'Never use more than 25', 'report only the newest', 'is not open', 'no letter or number in front', 'Every decision needs src']) {
    expect(SYSTEM_PROMPT.includes(rule)).toBe(true)
  }
})

test('messages are numbered from where the range starts', () => {
  const lines = renderNumbered([agent('first'), agent(''), agent('third')], 10)

  expect(lines).toEqual(['[#10] AGENT: first', '[#12] AGENT: third'])
})
