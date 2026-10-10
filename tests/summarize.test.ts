import { expect, test } from 'claude-code/testing'

import { summarize } from '../hooks/lib/summarize'
import type { Ask } from '../hooks/lib/summarize'
import { agent, user } from './helpers'

const answer = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    headline: 'The parser is done.',
    decisions: [],
    failed: [],
    done: [{ text: 'Added the parser.', proof: '12 tests pass', src: [1] }],
    running: [],
    notChecked: [],
    ...over,
  })

/** An ask that gives the replies in order, then the last one again. */
function script(...replies: string[]): { ask: Ask; prompts: string[] } {
  const prompts: string[] = []
  const ask: Ask = async prompt => {
    prompts.push(prompt)

    return { ok: true, text: replies[Math.min(prompts.length - 1, replies.length - 1)] }
  }

  return { ask, prompts }
}

const text = (r: Awaited<ReturnType<typeof summarize>>): string => (r.ok ? r.lines.map(l => l.text).join('\n') : r.reason)

test('a valid answer makes one call and is drawn with its sources', async () => {
  const { ask, prompts } = script(answer({ decisions: [{ ask: 'Pick one.', options: [], recommend: null, ifIgnored: null, src: [2] }] }))
  const out = text(await summarize([agent('Built it.'), agent('Which one?')], 1, ask))

  expect(prompts).toHaveLength(1)
  expect(out.includes('The parser is done.')).toBe(true)
  expect(out.includes('NEEDS YOU (1)')).toBe(true)
  expect(out.includes('Pick one. [#2]')).toBe(true)
})

test('numbers follow the session position of the first message', async () => {
  const { ask, prompts } = script(answer({ done: [{ text: 'Added it.', proof: 'shown', src: [148] }] }))
  const out = text(await summarize([agent('one'), agent('two')], 148, ask))

  expect(prompts[0].includes('[#148] AGENT: one')).toBe(true)
  expect(prompts[0].includes('[#149] AGENT: two')).toBe(true)
  expect(out.includes('#148 to #149')).toBe(true)
})

test('an unreadable answer is asked again with the problem named', async () => {
  const { ask, prompts } = script('not json at all', answer())
  const out = text(await summarize([agent('Built it.')], 1, ask))

  expect(prompts).toHaveLength(2)
  expect(prompts[1].includes('Your last answer had problems')).toBe(true)
  expect(out.includes('The parser is done.')).toBe(true)
})

test('an answer that never becomes readable is shown raw with a warning', async () => {
  const { ask, prompts } = script('first garbage', 'second garbage')
  const out = text(await summarize([agent('Built it.')], 1, ask))

  expect(prompts).toHaveLength(2)
  expect(out.includes('no readable structured answer')).toBe(true)
  expect(out.includes('second garbage')).toBe(true)
})

test('a name that is not in the messages is retried, and marked if it stays', async () => {
  const ghost = answer({ done: [{ text: 'Edited `ghost.ts`.', proof: '3 pass', src: [1] }] })
  const { ask, prompts } = script(ghost)
  const out = text(await summarize([agent('Edited a file.')], 1, ask))

  expect(prompts).toHaveLength(2)
  expect(prompts[1].includes('ghost.ts')).toBe(true)
  expect(out.includes('`ghost.ts` (?)')).toBe(true)
})

test('a done item without proof is drawn as not checked', async () => {
  const { ask } = script(answer({ done: [{ text: 'Fixed it.', proof: null, src: [1] }] }))
  const out = text(await summarize([agent('Fixed it.')], 1, ask))

  expect(out.includes('NOT CHECKED (1)')).toBe(true)
  expect(out.includes('DONE')).toBe(false)
})

test('an invented source number is not shown', async () => {
  const { ask } = script(answer({ done: [{ text: 'Added it.', proof: 'shown', src: [1, 99] }] }))
  const out = text(await summarize([agent('Added it.')], 1, ask))

  expect(out.includes('[#1]')).toBe(true)
  expect(out.includes('#99')).toBe(false)
})

test('an open question and a tool error come from the session, not the model', async () => {
  const q = { tool_use_id: 'q', tool: 'AskUserQuestion', input: { questions: [{ question: 'Which database?', options: [{ label: 'SQLite' }] }] } }
  const bad = { tool_use_id: 'b', tool: 'Bash', input: {}, text: 'exit 1', isError: true as const }
  const { ask } = script(answer({ done: [] }))
  const out = text(await summarize([agent('', [bad]), agent('', [q])], 5, ask))

  expect(out.includes('Which database? [#6]')).toBe(true)
  expect(out.includes('Options: A) SQLite')).toBe(true)
  expect(out.includes('Bash returned an error 1 time, and the last call failed. Last error: exit 1 [#5]')).toBe(true)
})

test('a long range is split, merged, and gets one headline', async () => {
  const prompts: string[] = []
  const ask: Ask = async prompt => {
    prompts.push(prompt)

    return { ok: true, text: prompt.includes('consecutive parts') ? answer({ headline: 'Everything is done.' }) : answer() }
  }
  const messages = Array.from({ length: 60 }, (_, i) => agent(`m${i} ${'w'.repeat(2300)}`))
  const out = text(await summarize(messages, 1, ask))

  expect(prompts.length).toBeGreaterThan(2)
  expect(prompts[prompts.length - 1].includes('A later part overrides an earlier part')).toBe(true)
  expect(out.split('\n')[0]).toBe('Everything is done.')
})

test('the headline is plain text, never a JSON object', async () => {
  const ask: Ask = async prompt => ({ ok: true, text: prompt.includes('consecutive parts') ? answer({ headline: 'All is done.' }) : answer() })
  const messages = Array.from({ length: 60 }, (_, i) => agent(`m${i} ${'w'.repeat(2300)}`))
  const first = text(await summarize(messages, 1, ask)).split('\n')[0]

  expect(first).toBe('All is done.')
  expect(first.includes('{')).toBe(false)
})

test('a later part overrides an earlier one, because the model is asked to reconcile them', async () => {
  const seen: string[] = []
  const ask: Ask = async prompt => {
    seen.push(prompt)

    return { ok: true, text: prompt.includes('consecutive parts') ? answer({ running: [], done: [{ text: 'Finished the build.', proof: '62 pass', src: [1] }] }) : answer({ running: [{ text: 'The build runs.', src: [1] }] }) }
  }
  const messages = Array.from({ length: 60 }, (_, i) => agent(`m${i} ${'w'.repeat(2300)}`))
  const out = text(await summarize(messages, 1, ask))

  expect(out.includes('RUNNING')).toBe(false)
  expect(out.includes('Finished the build.')).toBe(true)
  expect(seen.some(p => p.includes('"The build runs."'))).toBe(true)
})

test('if the reconcile call fails, the parts are joined in code and nothing is lost', async () => {
  const part = (item: string) => answer({ headline: `Headline of ${item}.`, done: [{ text: `${item} was added.`, proof: 'shown', src: [1] }] })
  const ask: Ask = async prompt => {
    if (prompt.includes('consecutive parts')) {
      return { ok: false, reason: 'the model call failed (overloaded)' }
    }

    // Only the first chunk holds message 1.
    return { ok: true, text: prompt.includes('[#1] AGENT') ? part('Item one') : part('Item two') }
  }
  const messages = Array.from({ length: 60 }, (_, i) => agent(`m${i} ${'w'.repeat(2300)}`))
  const out = await summarize(messages, 1, ask)
  const lines = out.ok ? out.lines.map(l => l.text) : []

  expect(lines[0].startsWith('Headline of Item two')).toBe(true)
  expect(lines.some(l => l.includes('Item one was added'))).toBe(true)
  expect(lines.some(l => l.includes('Item two was added'))).toBe(true)
})

test('a range too long to cover says what it left out', { timeoutMs: 30_000 }, async () => {
  const ask: Ask = async prompt => ({ ok: true, text: prompt.includes('consecutive parts') ? answer({ headline: 'Headline.' }) : answer() })
  const messages = Array.from({ length: 200 }, (_, i) => agent(`m${i} ${'w'.repeat(2300)}`))

  expect(text(await summarize(messages, 1, ask)).includes('The oldest')).toBe(true)
})

test('a failed model call is reported, never hidden', async () => {
  const out = await summarize([agent('a')], 1, async () => ({ ok: false, reason: 'the model call failed (rate_limit)' }))

  expect(out).toEqual({ ok: false, reason: 'the model call failed (rate_limit)' })
})

test('messages with no text are not sent', async () => {
  const { ask, prompts } = script(answer())
  const out = await summarize([agent('')], 1, ask)

  expect(prompts).toHaveLength(0)
  expect(out.ok && out.lines[0].text).toBe('The messages hold no text to summarize.')
})

test('a choice credited to the person must come from a message the person wrote', async () => {
  const decided = [{ text: 'Use SQLite.', src: [1] }, { text: 'Use tabs.', src: [2] }]
  const { ask } = script(answer({ decided }))
  const out = await summarize([user('Use SQLite, please.'), agent('I will use tabs.')], 1, ask)
  const lines = out.ok ? out.lines.map(l => l.text) : []

  expect(lines.some(l => l.includes('Use SQLite. [#1]'))).toBe(true)
  expect(lines.some(l => l.includes('Use tabs.'))).toBe(false)
})

test('the result carries a handoff and a reply template', async () => {
  const q = { tool_use_id: 'q', tool: 'AskUserQuestion', input: { questions: [{ question: 'Which database?', options: [{ label: 'SQLite' }, { label: 'Postgres' }] }] } }
  const { ask } = script(answer({ next: 'Run the live check.' }))
  const out = await summarize([agent('Built it.'), agent('', [q])], 1, ask)

  expect(out.ok && out.handoff.startsWith('HANDOFF from a catch-up of session messages #1 to #2.')).toBe(true)
  expect(out.ok && out.handoff.includes('NEXT: Run the live check.')).toBe(true)
  expect(out.ok && out.handoff.includes('1. Which database? [#2]')).toBe(true)
  expect(out.ok && out.reply.includes('1. Which database? [A) SQLite  B) Postgres]\n   Answer: ')).toBe(true)
})

test('an answered question is not open, even if the model lists it', async () => {
  const stale = { ask: 'Which sources show?', options: ['A', 'B'], recommend: null, ifIgnored: null, src: [2] }
  const { ask } = script(answer({ decisions: [stale], decided: [{ text: 'Show sources as numbers.', src: [2] }] }))
  const out = await summarize([agent('Which sources show?'), user('Show sources as numbers.')], 1, ask)
  const lines = out.ok ? out.lines.map(l => l.text) : []

  expect(lines.some(l => l.startsWith('DECIDED'))).toBe(true)
  expect(lines.some(l => l.startsWith('NEEDS YOU'))).toBe(false)
  expect(out.ok && out.reply).toBe('')
})

test('a vague proof is sent back to the model once', async () => {
  const vague = answer({ done: [{ text: 'Ran the breaks.', proof: 'listed in the messages', src: [1] }] })
  const { ask, prompts } = script(vague, answer())
  await summarize([agent('Ran the breaks.')], 1, ask)

  expect(prompts).toHaveLength(2)
  expect(prompts[1].includes('is vague')).toBe(true)
})

test('options the model prefixed with letters show one letter in the pane, the handoff and the reply template', async () => {
  const ask = { ask: 'Decide whether to publish the mod.', options: ['A) Publish now, after adding author fields.', 'B) Keep it private for now.'], recommend: 'B', ifIgnored: null, src: [1] }
  const { ask: model } = script(answer({ decisions: [ask] }))
  const out = await summarize([agent('Publish the mod or keep it private?')], 1, model)
  const all = out.ok ? [...out.lines.map(l => l.text), out.handoff, out.reply].join('\n') : ''

  expect(all.includes('A) A)')).toBe(false)
  expect(all.includes('B) B)')).toBe(false)
  expect(all.includes('Options: A) Publish now, after adding author fields.  B) Keep it private for now. ★')).toBe(true)
  expect(out.ok && out.reply.includes('[A) Publish now, after adding author fields.  B) Keep it private for now. ★]')).toBe(true)
})

test('a question that only the person\'s own pasted text contains is not an open question', async () => {
  const pasted = { ask: 'Which pane sources should show?', options: ['Numbers', 'Hidden'], recommend: null, ifIgnored: null, src: [] }
  const { ask } = script(answer({ decisions: [pasted] }))
  const out = await summarize([agent('Built it.'), user('Answers to the catch-up. 2. Which pane sources should show?')], 1, ask)
  const lines = out.ok ? out.lines.map(l => l.text) : []

  expect(lines.some(l => l.startsWith('NEEDS YOU'))).toBe(false)
  expect(out.ok && out.reply).toBe('')
})

test('the result carries the structured summary, already marked, for the pane to draw', async () => {
  const ghost = answer({ done: [{ text: 'Edited `ghost.ts`.', proof: '3 pass', src: [1] }] })
  const { ask } = script(ghost)
  const out = await summarize([agent('Edited a file.')], 1, ask)

  expect(out.ok && out.data?.summary.done[0].text).toBe('Edited `ghost.ts` (?).')
  expect(out.ok && out.data?.range).toEqual({ first: 1, last: 1, agentMessages: 1 })
})

test('a failure or an empty range has no structured summary', async () => {
  const empty = await summarize([agent('')], 1, script(answer()).ask)

  expect(empty.ok && empty.data).toBe(undefined)
})
