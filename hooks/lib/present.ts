import { mark } from './check'
import { withoutDismissed, dismissibleCount } from './dismiss'
import type { Dismissed } from './dismiss'
import { buildHandoff, buildReplyTemplate } from './handoff'
import { render, toPlainText } from './render'
import type { Line, Range } from './render'
import type { Summary } from './schema'

/** What the pane keeps of a finished summary: the structured summary, already marked, and its range. */
export type Data = { summary: Summary; range: Range }

/** Marks every quoted name that is not in `source` with (?). Done once, so later drawing needs no source. */
export function markSummary(s: Summary, source: string): Summary {
  const m = (text: string): string => mark(text, source)
  const opt = (text: string | null): string | null => (text === null ? null : m(text))

  return {
    ...s,
    headline: m(s.headline),
    next: opt(s.next),
    decisions: s.decisions.map(d => ({ ...d, ask: m(d.ask), options: d.options.map(m), recommend: opt(d.recommend), ifIgnored: opt(d.ifIgnored) })),
    failed: s.failed.map(f => ({ ...f, text: m(f.text) })),
    done: s.done.map(d => ({ ...d, text: m(d.text), proof: opt(d.proof) })),
    running: s.running.map(r => ({ ...r, text: m(r.text) })),
    notChecked: s.notChecked.map(n => ({ ...n, text: m(n.text), why: opt(n.why) })),
    decided: s.decided.map(d => ({ ...d, text: m(d.text) })),
  }
}

/** The lines to draw now, and how many open items the person has hidden. */
export function present(data: Data, dismissed: readonly Dismissed[], expanded: boolean): { lines: Line[]; hidden: number } {
  const shown = withoutDismissed(data.summary, dismissed)

  return { lines: render(shown, data.range, null, { expanded }), hidden: dismissibleCount(data.summary) - dismissibleCount(shown) }
}

/** The texts the buttons send, from what the person still sees: handled items are left out. */
export function textsFor(data: Data, dismissed: readonly Dismissed[]): { text: string; handoff: string; reply: string } {
  const shown = withoutDismissed(data.summary, dismissed)

  return {
    text: toPlainText(render(shown, data.range, null, { expanded: true })),
    handoff: buildHandoff(shown, data.range, null),
    reply: buildReplyTemplate(shown, null),
  }
}
