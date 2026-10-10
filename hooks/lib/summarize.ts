import type { SessionMessage } from 'claude-code'

import { issuesOf, vagueProofs } from './check'
import { extractFacts, withFacts } from './facts'
import { buildHandoff, buildReplyTemplate } from './handoff'
import { buildPrompt, buildReconcilePrompt, buildRetryPrompt, chunkLines, renderNumbered } from './prompt'
import { markSummary } from './present'
import type { Data } from './present'
import { render } from './render'
import type { Line } from './render'
import { dropAnswered, mergeSummaries, parseSummary, textsOf } from './schema'
import type { Summary } from './schema'
import { countAgentMessages, isPrompt } from './slice'

const CHUNK_CHARS = 48_000
const MAX_CHUNKS = 8

/** The result: lines to draw, or the reason nothing could be made. */
export type Result = { ok: true; lines: Line[]; handoff: string; reply: string; data?: Data } | { ok: false; reason: string }

export type Reply = { ok: true; text: string } | { ok: false; reason: string }

/** Sends one prompt to the model. The caller owns the engine, so it supplies this. */
export type Ask = (prompt: string) => Promise<Reply>

type Chunk = { summary: Summary } | { raw: string } | { reason: string }

/** One chunk: ask, parse, check; ask once more with the problems named; keep the better answer. */
async function summarizeChunk(prompt: string, source: string, min: number, max: number, users: ReadonlySet<number>, ask: Ask): Promise<Chunk> {
  const first = await ask(prompt)

  if (!first.ok) {
    return { reason: first.reason }
  }

  const read = (text: string) => {
    const parsed = parseSummary(text, min, max, users)

    return parsed.ok
      ? { parsed, problems: [...issuesOf(textsOf(parsed.summary), source), ...vagueProofs(parsed.summary.done)] }
      : { parsed, problems: [parsed.error] }
  }

  const one = read(first.text)

  if (one.parsed.ok && one.problems.length === 0) {
    return { summary: one.parsed.summary }
  }

  const retry = await ask(buildRetryPrompt(prompt, first.text, one.problems))

  if (!retry.ok) {
    return one.parsed.ok ? { summary: one.parsed.summary } : { raw: first.text }
  }

  const two = read(retry.text)

  if (two.parsed.ok && (!one.parsed.ok || two.problems.length <= one.problems.length)) {
    return { summary: two.parsed.summary }
  }

  return one.parsed.ok ? { summary: one.parsed.summary } : { raw: retry.text }
}

/**
 * Summarizes the messages. `first` is the session number of the first message.
 * The model writes a structured summary; code checks it, adds the facts it can
 * read itself (open questions, tool errors, calls with no result) and draws it.
 * A long range is split into chunks and merged. If the model never gives a
 * readable answer, the raw text is shown with a warning, never hidden.
 */
export async function summarize(messages: readonly SessionMessage[], first: number, ask: Ask): Promise<Result> {
  const lines = renderNumbered(messages, first)
  const last = first + messages.length - 1

  if (lines.length === 0) {
    return { ok: true, lines: [{ tone: 'dim', text: 'The messages hold no text to summarize.' }], handoff: '', reply: '' }
  }

  const all = chunkLines(lines, CHUNK_CHARS)
  const skipped = Math.max(0, all.length - MAX_CHUNKS)
  const chunks = all.slice(skipped)
  const left = all.slice(0, skipped).reduce((sum, c) => sum + c.length, 0)
  const source = chunks.flat().join('\n')
  const users = new Set(messages.flatMap((m, i) => (isPrompt(m) ? [first + i] : [])))

  const results = await Promise.all(
    chunks.map(c => {
      const numbers = c.map(line => Number(/^\[#(\d+)\]/.exec(line)?.[1] ?? first))

      return summarizeChunk(buildPrompt(c, c.length), c.join('\n'), Math.min(...numbers), Math.max(...numbers), users, ask)
    }),
  )
  const failed = results.find((r): r is { reason: string } => 'reason' in r)

  if (failed !== undefined) {
    return { ok: false, reason: failed.reason }
  }

  const readable = results.flatMap(r => ('summary' in r ? [r.summary] : []))
  const raw = results.find((r): r is { raw: string } => 'raw' in r)

  if (readable.length === 0 && raw !== undefined) {
    return {
      ok: true,
      lines: [
        { tone: 'warn', text: 'The model gave no readable structured answer. Raw text follows. Check it against the messages.' },
        ...raw.raw.split('\n').map((text): Line => ({ tone: 'item', text })),
      ],
      handoff: '',
      reply: '',
    }
  }

  // Later parts must override earlier ones, which only the model can judge. If it fails, join them in code.
  let merged = readable[0]

  if (readable.length > 1) {
    const joined = await summarizeChunk(buildReconcilePrompt(readable), source, first, last, users, ask)
    merged = 'summary' in joined ? joined.summary : mergeSummaries(readable, readable[readable.length - 1].headline)
  }

  if (left > 0) {
    merged.notChecked.push({ text: `The oldest ${left} messages were too long to read.`, why: null, src: [] })
  }

  const summary = withFacts(dropAnswered(merged), extractFacts(messages, first, last))
  const range = { first, last, agentMessages: countAgentMessages(messages) }
  const marked = markSummary(summary, source)
  const out = render(marked, range, null)

  if (raw !== undefined) {
    out.push({ tone: 'warn', text: 'One part of the messages gave no readable answer and is not in this summary.' })
  }

  return { ok: true, lines: out, handoff: buildHandoff(marked, { first, last }, null), reply: buildReplyTemplate(marked, null), data: { summary: marked, range } }
}
