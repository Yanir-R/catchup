import { stripLead } from './options'
import { unmarkdown } from './text'

/** What the model must return, and what code accepts of it. */

export type Item = { text: string; src: number[] }
export type Failure = { text: string; fixed: boolean; src: number[] }
/** `decide`: the person must choose or answer. `do`: the person should take an action. Absent means `decide`. */
export type Decision = { ask: string; options: string[]; recommend: string | null; ifIgnored: string | null; src: number[]; kind?: 'decide' | 'do' }
export type Done = { text: string; proof: string | null; src: number[] }
export type Unchecked = { text: string; why: string | null; src: number[] }

export type Summary = {
  headline: string
  decisions: Decision[]
  failed: Failure[]
  done: Done[]
  running: Item[]
  notChecked: Unchecked[]
  decided: Item[]
  next: string | null
}

export type Parsed = { ok: true; summary: Summary; notes: string[] } | { ok: false; error: string }

const MAX_TEXT = 320

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string {
  return typeof value === 'string' ? unmarkdown(value).trim().slice(0, MAX_TEXT) : ''
}

function optional(value: unknown): string | null {
  const text = str(value)

  return text === '' ? null : text
}

/** Keeps only whole numbers inside the range of messages the model was shown. */
function sources(value: unknown, min: number, max: number): number[] {
  if (!Array.isArray(value)) {
    return []
  }

  const kept = value.filter((n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max)

  return [...new Set(kept)].sort((a, b) => a - b)
}

function list(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isObject) : []
}

function extractJson(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')

  return start >= 0 && end > start ? text.slice(start, end + 1) : null
}

/**
 * Reads the model's answer. `min` and `max` are the first and last message
 * numbers it was shown: a source outside them is dropped as invented. A `done`
 * item with no proof or no valid source is moved to `notChecked`, because a
 * result nothing shows is not a result.
 */
export function parseSummary(text: string, min: number, max: number, users?: ReadonlySet<number>): Parsed {
  const json = extractJson(text)

  if (json === null) {
    return { ok: false, error: 'The answer holds no JSON object.' }
  }

  let raw: unknown

  try {
    raw = JSON.parse(json)
  } catch {
    return { ok: false, error: 'The JSON is not valid.' }
  }

  if (!isObject(raw)) {
    return { ok: false, error: 'The answer is not a JSON object.' }
  }

  const headline = str(raw.headline)

  if (headline === '') {
    return { ok: false, error: 'The "headline" field is missing or empty.' }
  }

  const notes: string[] = []
  const src = (value: unknown): number[] => sources(value, min, max)

  const decisions: Decision[] = list(raw.decisions)
    .map(d => ({
      ask: str(d.ask),
      options: Array.isArray(d.options) ? d.options.map(o => stripLead(str(o))).filter(o => o !== '') : [],
      recommend: optional(d.recommend),
      ifIgnored: optional(d.ifIgnored),
      src: src(d.src),
      kind: d.kind === 'do' ? ('do' as const) : ('decide' as const),
    }))
    .filter(d => d.ask !== '')
    // A question with no source cannot be traced, and one that cites only the person's own messages was not asked by an agent.
    .filter(d => d.src.length > 0 && !(users !== undefined && d.src.every(n => users.has(n))))
  const failed: Failure[] = list(raw.failed)
    .map(f => ({ text: str(f.text), fixed: f.fixed === true, src: src(f.src) }))
    .filter(f => f.text !== '')
  const running: Item[] = list(raw.running)
    .map(r => ({ text: str(r.text), src: src(r.src) }))
    .filter(r => r.text !== '')
  const notChecked: Unchecked[] = list(raw.notChecked)
    .map(n => ({ text: str(n.text), why: optional(n.why), src: src(n.src) }))
    .filter(n => n.text !== '')
  const decided: Item[] = []

  for (const d of list(raw.decided)) {
    const text = str(d.text)
    // A choice credited to the person must point at one of the person's own messages.
    const own = users === undefined ? src(d.src) : src(d.src).filter(n => users.has(n))

    if (text === '') {
      continue
    }

    if (own.length === 0) {
      notes.push('dropped a decided item with no message of the person as source')
    } else {
      decided.push({ text, src: own })
    }
  }

  const done: Done[] = []

  for (const d of list(raw.done)) {
    const item: Done = { text: str(d.text), proof: optional(d.proof), src: src(d.src) }

    if (item.text === '') {
      continue
    }

    if (item.proof === null || item.src.length === 0) {
      notChecked.push({ text: item.text, why: 'No proof or source is shown.', src: item.src })
      notes.push('moved a done item without proof to notChecked')
    } else {
      done.push(item)
    }
  }

  return { ok: true, summary: { headline, decisions, failed, done, running, notChecked, decided, next: optional(raw.next) }, notes }
}

/**
 * Drops an open decision that the person already answered. Its sources are all
 * messages that a decided item also cites: the question and its answer cannot both stand.
 */
export function dropAnswered(s: Summary): Summary {
  const answered = new Set(s.decided.flatMap(d => d.src))

  return { ...s, decisions: s.decisions.filter(d => d.src.length === 0 || !d.src.every(n => answered.has(n))) }
}

/** Every string the model wrote, for the checks that read text. */
export function textsOf(s: Summary): string[] {
  return [
    s.headline,
    ...s.decisions.flatMap(d => [d.ask, ...d.options, d.recommend ?? '', d.ifIgnored ?? '']),
    ...s.failed.map(f => f.text),
    ...s.done.flatMap(d => [d.text, d.proof ?? '']),
    ...s.running.map(r => r.text),
    ...s.notChecked.flatMap(n => [n.text, n.why ?? '']),
    ...s.decided.map(d => d.text),
    s.next ?? '',
  ].filter(t => t !== '')
}

const norm = (text: string): string => text.toLowerCase().replace(/\s+/g, ' ').trim()

function dedupe<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>()

  return items.filter(item => {
    const k = norm(key(item))

    if (seen.has(k)) {
      return false
    }

    seen.add(k)

    return true
  })
}

/** Joins the summaries of consecutive chunks, oldest first. The headline is the caller's. */
export function mergeSummaries(parts: readonly Summary[], headline: string): Summary {
  return {
    headline,
    decisions: dedupe(parts.flatMap(p => p.decisions), d => d.ask),
    failed: dedupe(parts.flatMap(p => p.failed), f => f.text),
    done: dedupe(parts.flatMap(p => p.done), d => d.text),
    running: dedupe(parts.flatMap(p => p.running), r => r.text),
    notChecked: dedupe(parts.flatMap(p => p.notChecked), n => n.text),
    decided: dedupe(parts.flatMap(p => p.decided), d => d.text),
    next: parts[parts.length - 1]?.next ?? null,
  }
}

export const EMPTY: Summary = { headline: '', decisions: [], failed: [], done: [], running: [], notChecked: [], decided: [], next: null }
