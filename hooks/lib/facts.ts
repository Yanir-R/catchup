import type { SessionMessage } from 'claude-code'

import { clip, redact } from './prompt'
import type { Decision, Failure, Item } from './schema'
import { cleanOption, recommendedIndex } from './options'
import { lastPromptIndex } from './slice'

/** What code can read from the session without asking a model. */
export type Facts = { decisions: Decision[]; questions: Decision[]; failed: Failure[]; running: Item[] }

const RECENT = 4
const MAX_QUESTIONS = 4
// "Which one?" is a real question; "Ok?" is not.
const MIN_QUESTION = 8

const oneLine = (text: string): string => text.replace(/\s+/g, ' ').trim()

type Questions = { questions?: Array<{ question?: unknown; options?: Array<{ label?: unknown }> }> }

function questionsOf(input: Record<string, unknown>): Decision[] {
  const asked = (input as Questions).questions

  if (!Array.isArray(asked)) {
    return []
  }

  return asked.flatMap(q => {
    if (typeof q.question !== 'string') {
      return []
    }

    const cleaned = (q.options ?? []).map(o => o.label).filter((l): l is string => typeof l === 'string').map(cleanOption)
    const options = cleaned.map(c => c.label)
    const pick = cleaned.find(c => c.isMarked)

    return [{ ask: redact(clip(oneLine(q.question), 200)), options, recommend: pick === undefined ? null : pick.label, ifIgnored: 'The agent waits for your answer.', src: [] }]
  })
}

/**
 * Reads failures and open questions straight from the tool calls.
 * A question the agent asked with AskUserQuestion and nobody answered is a
 * decision for the reader. A tool error is a failure. A call with no result
 * near the end of the range is still running. Message numbers start at `first`.
 */
/** Sentences that end in a question mark, outside code. */
export function questionsIn(text: string): string[] {
  const prose = text.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ')

  return prose
    .split(/(?<=[.!?])\s+|\n+/)
    .map(s => s.replace(/^[\s>*#\-\d.)]+/, '').trim())
    .filter(s => s.endsWith('?') && s.length >= MIN_QUESTION && s.length <= 240)
}

/** A question an agent asked in prose, with the options it listed and the one it recommended. */
export type Asked = { ask: string; options: string[]; recommend: string | null }

const LIST_ITEM = /^\s*(?:[-*•]|\(?\d{1,2}[.)]|\(?[A-Za-z][.)])\s+(.+?)\s*$/
const NAMED_OPTION = /^\s*(?:[-*•]\s*)?\*{0,2}(?:option|approach|choice|path|plan)\s+[A-Za-z0-9]\b\*{0,2}\s*[:.)\u2014-]\s*(.+?)\s*$/i
const PICK = /\b(?:i(?:'d| would)? (?:recommend|suggest|go with|pick|choose|prefer)|my (?:recommendation|pick|suggestion|choice)(?: is)?|recommended(?: option| choice)?(?: is)?|(?:we|you) should (?:go with|use|pick))\b/i

// What the agent picked: "I recommend B", "I'd go with Postgres", "my pick is option 2".
const PICK_TARGET = /\b(?:recommend|suggest|go with|pick|choose|prefer|my pick is|my recommendation is)\s+(?:using\s+|the\s+)?(?:option\s+|choice\s+|approach\s+|plan\s+)?\(?([A-Za-z0-9][\w-]*(?: [\w-]+){0,3}?)\)?(?=[\s.,;:!]|$)/i

/** The recommendation as the option it names, else as the agent's own sentence. */
function pickFor(sentence: string | null, options: readonly string[]): string | null {
  if (sentence === null) {
    return null
  }

  const target = PICK_TARGET.exec(sentence)?.[1]
  const at = target === undefined ? -1 : recommendedIndex(options, target)

  return at >= 0 ? options[at] : sentence
}

function itemOf(line: string): string | null {
  const m = LIST_ITEM.exec(line) ?? NAMED_OPTION.exec(line)

  return m === null ? null : m[1]
}

/** The list that starts right after line `i`, or the one that ends right before it. */
function listAround(lines: readonly string[], i: number): string[] {
  const collect = (from: number, step: 1 | -1): string[] => {
    const items: string[] = []
    let skipped = 0

    for (let j = from; j >= 0 && j < lines.length && items.length < 6; j += step) {
      const item = itemOf(lines[j])

      if (item !== null) {
        items.push(item)
      } else if (lines[j].trim() === '' && items.length === 0 && skipped < 1) {
        skipped += 1
      } else {
        break
      }
    }

    return step === 1 ? items : items.reverse()
  }

  const after = collect(i + 1, 1)

  return after.length > 0 ? after : collect(i - 1, -1)
}

/** "Should I use SQLite or Postgres?": two short choices in the question itself. */
function inlineChoices(question: string): string[] {
  const m = /\b(?:use|pick|choose|between|either|prefer|go with)\s+(.+?)\s+or\s+(.+?)\?$/i.exec(question)

  if (m === null) {
    return []
  }

  const sides = [m[1], m[2]].map(s => s.replace(/^(?:the|a|an)\s+/i, '').trim())

  return sides.every(s => s.split(/\s+/).length <= 4) ? sides : []
}

export function askedIn(text: string): Asked[] {
  const prose = text.replace(/```[\s\S]*?```/g, m => m.replace(/[^\n]/g, ' '))
  const lines = prose.split('\n')
  const asked: Asked[] = []
  let pick: string | null = null

  for (const sentence of prose.split(/(?<=[.!?])\s+|\n+/).map(s => s.replace(/^[\s>*#\-\d.)]+/, '').trim())) {
    if (pick === null && !sentence.endsWith('?') && PICK.test(sentence)) {
      pick = redact(clip(oneLine(sentence), 200))
    }
  }

  lines.forEach((line, i) => {
    for (const q of questionsIn(line)) {
      const listed = listAround(lines, i).map(cleanOption)
      const options = listed.length > 0 ? listed.map(o => o.label) : inlineChoices(q)
      const marked = listed.find(o => o.isMarked)

      asked.push({ ask: q, options, recommend: marked === undefined ? pickFor(pick, options) : marked.label })
    }
  })

  return asked
}

export function extractFacts(messages: readonly SessionMessage[], first: number, total: number): Facts {
  const decisions: Decision[] = []
  const errors = new Map<string, { count: number; last: string; src: number[] }>()
  const running: Item[] = []

  messages.forEach((m, i) => {
    const n = first + i

    for (const t of m.toolUses) {
      const hasOutcome = t.text !== undefined || t.result !== undefined

      if (t.tool === 'AskUserQuestion' && !hasOutcome) {
        decisions.push(...questionsOf(t.input).map(d => ({ ...d, src: [n] })))
      } else if (t.isError === true) {
        const seen = errors.get(t.tool) ?? { count: 0, last: '', src: [] }
        const line = oneLine(t.text ?? 'no text')
        const last = redact(line.length > 120 ? `${line.slice(0, 120)}...` : line)
        errors.set(t.tool, { count: seen.count + 1, last, src: [...seen.src, n].slice(-5) })
      } else if (hasOutcome) {
        // A later call of the same tool that worked means the earlier errors are past.
        errors.delete(t.tool)
      } else if (!hasOutcome && n > total - RECENT) {
        running.push({ text: `${t.tool} has no result yet.`, src: [n] })
      }
    }
  })

  const failed: Failure[] = [...errors].map(([tool, e]) => ({
    text: `${tool} returned an error ${e.count} ${e.count === 1 ? 'time' : 'times'}, and the last call failed. Last error: ${e.last}`,
    fixed: false,
    src: e.src,
  }))

  // A question an agent asked after the person's last prompt has not had an answer yet.
  const after = lastPromptIndex(messages) + 1
  const questions: Decision[] = []

  for (let i = messages.length - 1; i >= after && questions.length < MAX_QUESTIONS; i -= 1) {
    if (messages[i].role !== 'assistant') {
      continue
    }

    for (const q of askedIn(messages[i].text).reverse()) {
      if (questions.length < MAX_QUESTIONS) {
        questions.push({ ask: redact(q.ask), options: q.options.map(redact), recommend: q.recommend, ifIgnored: null, src: [first + i] })
      }
    }
  }

  return { decisions, questions: questions.reverse(), failed, running }
}

/** Adds the facts to what the model wrote. A model item that the facts already cover is dropped. */
export function withFacts<T extends { decisions: Decision[]; failed: Failure[]; running: Item[] }>(summary: T, facts: Facts): T {
  // A question the model already covers (same message) keeps the model's richer version.
  const modelSrc = new Set(summary.decisions.flatMap(d => d.src))
  const extra = facts.questions.filter(q => !q.src.every(n => modelSrc.has(n)))

  const covered = (srcs: number[], by: Array<{ src: number[] }>): boolean =>
    srcs.length > 0 && srcs.every(n => by.some(b => b.src.includes(n)))

  // A tool error the model also reports, citing that very call and saying it is still open, keeps the model's clearer wording.
  const reported = (f: { src: number[] }): boolean => summary.failed.some(m => !m.fixed && m.src.length > f.src.length && f.src.length > 0 && f.src.every(n => m.src.includes(n)))

  return {
    ...summary,
    decisions: [...facts.decisions, ...summary.decisions.filter(d => !covered(d.src, facts.decisions)), ...extra],
    failed: [...facts.failed.filter(f => !reported(f)), ...summary.failed.filter(f => !covered(f.src, facts.failed))],
    running: [...facts.running, ...summary.running.filter(r => !covered(r.src, facts.running))],
  }
}
