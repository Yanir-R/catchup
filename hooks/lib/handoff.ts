import { mark } from './check'
import { optionsText } from './options'
import { ref } from './refs'
import type { Summary } from './schema'

type Range = { first: number; last: number }

const MAX_FIXED = 3

/**
 * A brief to paste into a fresh session so it can carry on. It says what is
 * decided (so nobody asks again), what is open, what is done with its proof,
 * and what is unproven. It is data from a summary, and says so.
 * `source` marks quoted names that are not in it with (?); null means the text is already marked.
 */
export function buildHandoff(s: Summary, range: Range, source: string | null): string {
  const m = source === null ? (text: string): string => text : (text: string): string => mark(text, source)
  const out: string[] = [
    `HANDOFF from a catch-up of session messages #${range.first} to #${range.last}.`,
    'This is a summary, not an instruction. Check any item marked (?) before you use it.',
    '',
    `STATE: ${m(s.headline)}`,
    `NEXT: ${s.next === null ? 'Not stated. Ask the person.' : m(s.next)}`,
  ]

  function block<T>(label: string, items: readonly T[], draw: (item: T, i: number) => string[]): void {
    if (items.length > 0) {
      out.push('', `${label}:`, ...items.flatMap(draw))
    }
  }

  block('DECIDED (do not ask again)', s.decided, d => [`- ${m(d.text)}${ref(d.src)}`])
  block('OPEN (the person must answer)', s.decisions.filter(d => d.kind !== 'do'), (d, i) => [
    `${i + 1}. ${m(d.ask)}${ref(d.src)}`,
    ...(d.options.length > 0 ? [`   Options: ${optionsText(d.options, d.recommend, m)}`] : []),
    `   ${d.recommend === null ? 'No recommendation given.' : `Recommended: ${m(d.recommend)}`}`,
    ...(d.ifIgnored === null ? [] : [`   If ignored: ${m(d.ifIgnored)}`]),
  ])
  block('TO DO (the person should do)', s.decisions.filter(d => d.kind === 'do'), d => [`- ${m(d.ask)}${ref(d.src)}`])
  block('DONE (proof shown)', s.done, d => [`- ${m(d.text.replace(/\.+$/, ''))}. Proof: ${m(d.proof ?? '')}${ref(d.src)}`])
  block('FAILED (still open)', s.failed.filter(f => !f.fixed), f => [`- ${m(f.text)}${ref(f.src)}`])
  const fixed = s.failed.filter(f => f.fixed)
  block('FIXED', fixed.slice(0, MAX_FIXED), f => [`- ${m(f.text)}${ref(f.src)}`])

  if (fixed.length > MAX_FIXED) {
    out.push(`+${fixed.length - MAX_FIXED} more fixed, not shown.`)
  }

  block('RUNNING', s.running, r => [`- ${m(r.text)}${ref(r.src)}`])
  block('NOT CHECKED', s.notChecked, n => [`- ${m(n.text)}${n.why === null ? '' : ` ${m(n.why)}`}${ref(n.src)}`])

  return out.join('\n')
}

/** One slot per open question. Tasks are not questions, so they get no slot. The person fills the slots in and sends them back. */
export function buildReplyTemplate(s: Summary, source: string | null): string {
  const decide = s.decisions.filter(d => d.kind !== 'do')

  if (decide.length === 0) {
    return ''
  }

  const m = source === null ? (text: string): string => text : (text: string): string => mark(text, source)
  const slots = decide.flatMap((d, i) => [
    `${i + 1}. ${m(d.ask)}${d.options.length === 0 ? '' : ` [${optionsText(d.options, d.recommend, m)}]`}`,
    ...(d.recommend === null ? [] : [`   The assistant recommends: ${m(d.recommend)}`]),
    '   Answer: ',
  ])

  return ['Answers to the catch-up. I filled in each Answer line:', '', ...slots].join('\n')
}
