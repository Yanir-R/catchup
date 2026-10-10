import { expect, test } from 'claude-code/testing'

import { countAgentMessages, isAgentMessage, isPrompt, lastPromptIndex, pick, pickStart, sinceLastPrompt } from '../hooks/lib/slice'
import { agent, toolResult, user } from './helpers'

const thread = [user('first'), agent('a1'), user('second prompt'), agent('a2'), toolResult(), agent('a3')]

test('since the last prompt starts after the last typed prompt', () => {
  expect(sinceLastPrompt(thread).map(m => m.text)).toEqual(['a2', '', 'a3'])
})

test('tool results and engine rows are not prompts', () => {
  expect(isPrompt(toolResult())).toBe(false)
  expect(isPrompt(user('<local-command-stdout>x</local-command-stdout>'))).toBe(false)
  expect(isPrompt(user('<command-name>/spike</command-name>'))).toBe(false)
  expect(isPrompt(user('<cross-session-message from="x">hi</cross-session-message>'))).toBe(false)
  expect(isPrompt(user('real prompt'))).toBe(true)
})

test('rows from commands do not move the start', () => {
  const rows = [user('typed'), agent('a'), user('<command-name>/catchup</command-name>'), agent('b')]

  expect(sinceLastPrompt(rows).map(m => m.text)).toEqual(['a', '<command-name>/catchup</command-name>', 'b'])
})

test('a count takes the last n messages, even 1', () => {
  expect(pick(thread, 1).map(m => m.text)).toEqual(['a3'])
  expect(pick(thread, 2).map(m => m.text)).toEqual(['', 'a3'])
  expect(pick(thread, 99)).toHaveLength(thread.length)
})

test('no typed prompt means the whole thread', () => {
  expect(sinceLastPrompt([agent('a'), agent('b')])).toHaveLength(2)
})

const tool = { tool_use_id: 't', tool: 'Bash', input: {} }

test('one reply with many tool calls counts as one message', () => {
  const reply = [
    agent('Checking.', [tool]),
    toolResult(),
    agent('', [tool]),
    toolResult(),
    agent('', [tool]),
    toolResult(),
    user('<local-command-stdout>catchup: summary pane opened.</local-command-stdout>'),
    user('<command-name>/catchup</command-name>'),
    agent('Done.'),
  ]

  expect(countAgentMessages(reply)).toBe(2)
})

test('your own prompts and command rows are not agent messages', () => {
  expect(isAgentMessage(user('a prompt you typed'))).toBe(false)
  expect(isAgentMessage(agent(''))).toBe(false)
  expect(isAgentMessage(agent('text'))).toBe(true)
})

test('a message from another session or a task counts', () => {
  expect(isAgentMessage(user('<cross-session-message from="x">hi</cross-session-message>'))).toBe(true)
  expect(isAgentMessage(user('<task-notification>done</task-notification>'))).toBe(true)
})

test('the last prompt index', () => {
  expect(lastPromptIndex(thread)).toBe(2)
  expect(lastPromptIndex([agent('a')])).toBe(-1)
})

test('a range starts after the last prompt, or n from the end', () => {
  expect(pickStart(thread, null)).toBe(3)
  expect(pickStart(thread, 2)).toBe(4)
  expect(pickStart(thread, 99)).toBe(0)
})
