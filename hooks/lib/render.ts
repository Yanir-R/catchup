import { mark } from './check'
import { optionsText } from './options'
import { ref } from './refs'
import type { Summary } from './schema'

/** One line of the pane. The pane maps the tone to a style. */
export type Section = 'next' | 'needs' | 'failed' | 'done' | 'fixed' | 'running' | 'unchecked' | 'decided'

/** The open item a line stands for, so a button beside it can mark it handled. */
export type Dismiss = { text: string; src: number[] }

export type Line = { tone: 'head' | 'label' | 'item' | 'sub' | 'rec' | 'dim' | 'warn'; text: string; section?: Section; dismiss?: Dismiss }

export type Range = { first: number; last: number; agentMessages: number }

export type Options = {
  /** Draw every section. When false, only what needs the reader is drawn in full, and the rest is one line of counts. */
  expanded?: boolean
}

const MAX_ITEMS = 5
const MAX_FIXED = 3

const noDot = (text: string): string => text.replace(/\.+$/, '')

/**
 * Draws a summary the same way every time: fixed order, fixed labels, capped lists.
 * `source` marks quoted names that are not in it with (?); null means the text is already marked.
 */
export function render(summary: Summary, range: Range, source: string | null, options: Options = {}): Line[] {
  const expanded = options.expanded !== false
  const m = source === null ? (text: string): string => text : (text: string): string => mark(text, source)
  const lines: Line[] = [{ tone: 'head', text: m(summary.headline) }]
  const noun = range.agentMessages === 1 ? 'message' : 'messages'
  lines.push({ tone: 'dim', text: `${range.agentMessages} new ${noun} · #${range.first} to #${range.last}` })

  if (summary.next !== null) {
    lines.push({ tone: 'item', section: 'next', text: `Next: ${m(summary.next)}` })
  }

  function section<T>(
    id: Section,
    label: string,
    items: readonly T[],
    max: number,
    draw: (item: T, i: number) => Line[],
    dismissOf?: (item: T) => Dismiss,
  ): void {
    if (items.length === 0) {
      return
    }

    lines.push({ tone: 'label', section: id, text: `${label} (${items.length})` })
    items.slice(0, max).forEach((item, i) => {
      const drawn = draw(item, i).map((l): Line => ({ ...l, section: id }))

      if (dismissOf !== undefined && drawn.length > 0) {
        drawn[0] = { ...drawn[0], dismiss: dismissOf(item) }
      }

      lines.push(...drawn)
    })

    if (items.length > max) {
      lines.push({ tone: 'dim', text: `+${items.length - max} more not shown` })
    }
  }

  // Questions to decide come first, then tasks. Neither is ever cut: the reader must see every one.
  const decide = summary.decisions.filter(d => d.kind !== 'do')
  const todo = summary.decisions.filter(d => d.kind === 'do')

  section(
    'needs',
    'NEEDS YOU',
    [...decide, ...todo],
    Infinity,
    d => {
      if (d.kind === 'do') {
        return [
          { tone: 'item', text: `☐ ${m(d.ask)}${ref(d.src)}` },
          ...(d.ifIgnored === null ? [] : [{ tone: 'sub' as const, text: `If ignored: ${m(d.ifIgnored)}` }]),
        ]
      }

      const out: Line[] = [{ tone: 'item', text: `${decide.indexOf(d) + 1}. ${m(d.ask)}${ref(d.src)}` }]

      if (d.options.length > 0) {
        out.push({ tone: 'sub', text: `Options: ${optionsText(d.options, d.recommend, m)}` })
      }

      out.push(d.recommend === null ? { tone: 'sub', text: 'No recommendation given.' } : { tone: 'rec', text: `★ Recommended: ${m(d.recommend)}` })

      if (d.ifIgnored !== null) {
        out.push({ tone: 'sub', text: `If ignored: ${m(d.ifIgnored)}` })
      }

      return out
    },
    d => ({ text: d.ask, src: d.src }),
  )
  section('failed', 'FAILED', summary.failed.filter(f => !f.fixed), MAX_ITEMS, f => [{ tone: 'item', text: `- ${m(f.text)}${ref(f.src)}` }], f => ({ text: f.text, src: f.src }))

  const fixed = summary.failed.filter(f => f.fixed)

  if (!expanded) {
    const counts = [
      ['DONE', summary.done.length],
      ['RUNNING', summary.running.length],
      ['NOT CHECKED', summary.notChecked.length],
      ['DECIDED', summary.decided.length],
      ['FIXED', fixed.length],
    ]
      .filter(([, n]) => (n as number) > 0)
      .map(([label, n]) => `${label as string} ${n as number}`)

    if (counts.length > 0) {
      lines.push({ tone: 'dim', text: counts.join(' · ') })
    }

    return lines
  }

  section('done', 'DONE', summary.done, MAX_ITEMS, d => [{ tone: 'item', text: `- ${m(noDot(d.text))}. Proof: ${m(d.proof ?? '')}${ref(d.src)}` }])
  section('fixed', 'FIXED', fixed, MAX_FIXED, f => [{ tone: 'item', text: `- ${m(f.text)}${ref(f.src)}` }])
  section('running', 'RUNNING', summary.running, MAX_ITEMS, r => [{ tone: 'item', text: `- ${m(r.text)}${ref(r.src)}` }])
  section(
    'unchecked',
    'NOT CHECKED',
    summary.notChecked,
    MAX_ITEMS,
    n => [{ tone: 'item', text: `- ${m(n.text)}${n.why === null ? '' : ` ${m(n.why)}`}${ref(n.src)}` }],
    n => ({ text: n.text, src: n.src }),
  )
  section('decided', 'DECIDED', summary.decided, MAX_ITEMS, d => [{ tone: 'item', text: `- ${m(d.text)}${ref(d.src)}` }])

  return lines
}

/** The same lines as plain text, for the clipboard. */
export function toPlainText(lines: readonly Line[]): string {
  return lines.map(l => (l.tone === 'sub' || l.tone === 'rec' ? `   ${l.text}` : l.text)).join('\n')
}
