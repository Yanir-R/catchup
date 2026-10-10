import { expect, test } from 'claude-code/testing'

import { askedIn, extractFacts, questionsIn, withFacts } from '../hooks/lib/facts'
import { agent, user } from './helpers'

const ask = { tool_use_id: 'q', tool: 'AskUserQuestion', input: { questions: [{ question: 'Which database?', options: [{ label: 'SQLite' }, { label: 'Postgres' }] }] } }

test('an unanswered question to the person is a decision with its options', () => {
  const facts = extractFacts([agent('', [ask])], 7, 7)

  expect(facts.decisions).toEqual([
    { ask: 'Which database?', options: ['SQLite', 'Postgres'], recommend: null, ifIgnored: 'The agent waits for your answer.', src: [7] },
  ])
})

test('an answered question is not a decision', () => {
  expect(extractFacts([agent('', [{ ...ask, text: 'SQLite' }])], 1, 1).decisions).toEqual([])
})

const bash = (text: string, isError?: true) => agent('', [{ tool_use_id: 'b', tool: 'Bash', input: {}, text, ...(isError ? { isError } : {}) }])

test('repeated tool errors with no success after them are grouped, with the last error and the numbers', () => {
  const facts = extractFacts([bash('fine'), bash('boom one', true), bash('boom two', true)], 20, 22)

  expect(facts.failed).toHaveLength(1)
  expect(facts.failed[0].text).toBe('Bash returned an error 2 times, and the last call failed. Last error: boom two')
  expect(facts.failed[0].src).toEqual([21, 22])
  expect(facts.failed[0].fixed).toBe(false)
})

test('an error that a later call of the same tool survived is past, not a failure', () => {
  expect(extractFacts([bash('boom', true), bash('fine')], 1, 2).failed).toEqual([])
  expect(extractFacts([bash('boom one', true), bash('fine'), bash('boom two', true)], 20, 22).failed[0].src).toEqual([22])
})

test('a long error is cut to one short line with no cut marker', () => {
  const long = `${'x'.repeat(300)}\nsecond line`
  const text = extractFacts([bash(long, true)], 1, 1).failed[0].text

  expect(text.includes('\n')).toBe(false)
  expect(text.includes('[...cut...]')).toBe(false)
  expect(text.length).toBeLessThan(220)
})

test('only a call with no result near the end is still running', () => {
  const open = (id: string) => agent('', [{ tool_use_id: id, tool: 'Bash', input: {} }])
  const facts = extractFacts([open('old'), agent('a'), agent('b'), agent('c'), agent('d'), open('new')], 1, 6)

  expect(facts.running).toEqual([{ text: 'Bash has no result yet.', src: [6] }])
})

test('facts go first and cover the model items that repeat them', () => {
  const facts = { decisions: [], questions: [], failed: [{ text: 'Bash returned an error 1 time.', fixed: false, src: [5] }], running: [] }
  const model = { decisions: [], failed: [{ text: 'The build failed.', fixed: false, src: [5] }, { text: 'Deploy failed.', fixed: false, src: [9] }], running: [] }
  const out = withFacts(model, facts)

  expect(out.failed.map(f => f.text)).toEqual(['Bash returned an error 1 time.', 'Deploy failed.'])
})

test('questions are found in prose, not in code, and short ones are ignored', () => {
  const text = 'Done. Should I build it now? Run `what is this?` to see.\n```\nis this code?\n```\n- Which pane do you want?\nOk?'

  expect(questionsIn(text)).toEqual(['Should I build it now?', 'Which pane do you want?'])
})

test('a question asked after the last prompt is open; one before it is left to the model', () => {
  const thread = [agent('Old question here, is it fine?'), user('yes'), agent('Which database should I use?'), agent('Also: do you want a handoff button?')]
  const facts = extractFacts(thread, 10, 13)

  expect(facts.questions.map(q => q.ask)).toEqual(['Which database should I use?', 'Also: do you want a handoff button?'])
  expect(facts.questions.map(q => q.src)).toEqual([[12], [13]])
})

test('at most 4 questions, the most recent', () => {
  const many = Array.from({ length: 6 }, (_, i) => agent(`Question number ${i} here?`))
  const facts = extractFacts(many, 1, 6)

  expect(facts.questions.map(q => q.ask)).toEqual(['Question number 2 here?', 'Question number 3 here?', 'Question number 4 here?', 'Question number 5 here?'])
})

test('the model keeps its richer version of a question, and a missed question is added', () => {
  const facts = { decisions: [], questions: [{ ask: 'Which one?', options: [], recommend: null, ifIgnored: null, src: [7] }, { ask: 'Missed one?', options: [], recommend: null, ifIgnored: null, src: [8] }], failed: [], running: [] }
  const model = { decisions: [{ ask: 'Pick a database.', options: ['A', 'B'], recommend: null, ifIgnored: null, src: [7] }], failed: [], running: [] }
  const out = withFacts(model, facts)

  expect(out.decisions.map(d => d.ask)).toEqual(['Pick a database.', 'Missed one?'])
})

test('options listed after a question are read: numbered, lettered, bulleted', () => {
  const numbered = askedIn('Which database should I use?\n1. SQLite — one file\n2. Postgres (Recommended) — scales')
  const lettered = askedIn('Which layout do you want?\n(A) Compact\n(B) Wide')
  const bullets = askedIn('Where should the summary go?\n\n- **Pane** — opens a pane\n- **Transcript** — stays in the log')

  expect(numbered).toEqual([{ ask: 'Which database should I use?', options: ['SQLite', 'Postgres'], recommend: 'Postgres' }])
  expect(lettered[0].options).toEqual(['Compact', 'Wide'])
  expect(bullets[0].options).toEqual(['Pane', 'Transcript'])
})

test('options listed before the question are read, including "Option A:" style', () => {
  const out = askedIn('Option A: use a pane.\nOption B: print to the transcript.\nWhich do you prefer?')

  expect(out[0].options).toEqual(['use a pane', 'print to the transcript'])
})

test('two short choices inside the question are read; a long clause is not split', () => {
  expect(askedIn('Should I use SQLite or Postgres?')[0].options).toEqual(['SQLite', 'Postgres'])
  expect(askedIn('Do you want to use the old approach or should I rewrite everything from scratch?')[0].options).toEqual([])
})

test('a recommendation in prose is matched to its option, so the right one gets the star', () => {
  const byLetter = askedIn('Which one?\nA) Fast\nB) Safe\nI recommend B because it keeps the data.')[0]
  const byName = askedIn("Which one?\n- Fast\n- Safe\nI'd go with Safe, it keeps the data.")[0]
  const byNumber = askedIn('Which one?\n1. Fast\n2. Safe\nMy pick is option 2.')[0]

  expect(byLetter.recommend).toBe('Safe')
  expect(byName.recommend).toBe('Safe')
  expect(byNumber.recommend).toBe('Safe')
})

test('a recommendation that names no option stays as the agent wrote it', () => {
  const out = askedIn('Should I publish the mod? I would go with keeping it private for now.')[0]

  expect(out.options).toEqual([])
  expect(out.recommend).toBe('I would go with keeping it private for now.')
})

test('an option marked recommended wins over a sentence', () => {
  const out = askedIn('Which one?\n- Fast\n- Safe ⭐ Recommended\nI suggest Fast.')[0]

  expect(out.recommend).toBe('Safe')
})

test('no question means nothing is asked; code blocks are ignored', () => {
  expect(askedIn('All done. I recommend B.')).toEqual([])
  expect(askedIn('```\nIs this code?\n1. a\n2. b\n```')).toEqual([])
})

test('a question with no list and no recommendation has neither', () => {
  expect(askedIn('Did you want the handoff button too?')).toEqual([{ ask: 'Did you want the handoff button too?', options: [], recommend: null }])
})

test('an open question carries its options and recommendation into the facts', () => {
  const facts = extractFacts([agent('Which database?\n1. SQLite\n2. Postgres (Recommended)')], 40, 40)

  expect(facts.questions).toEqual([{ ask: 'Which database?', options: ['SQLite', 'Postgres'], recommend: 'Postgres', ifIgnored: null, src: [40] }])
})

test('the question tool marks its recommended option with a suffix; that becomes the recommendation', () => {
  const tool = { tool_use_id: 'q', tool: 'AskUserQuestion', input: { questions: [{ question: 'Which database?', options: [{ label: 'SQLite (Recommended)' }, { label: 'Postgres' }] }] } }
  const d = extractFacts([agent('', [tool])], 5, 5).decisions[0]

  expect(d.options).toEqual(['SQLite', 'Postgres'])
  expect(d.recommend).toBe('SQLite')
})

test('a short question such as "Which one?" is still a question; a fragment is not', () => {
  expect(questionsIn('Which one?')).toEqual(['Which one?'])
  expect(questionsIn('Ready to go on?')).toEqual(['Ready to go on?'])
  expect(questionsIn('Ok?')).toEqual([])
})
