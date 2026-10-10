import type { Summary } from './schema'

/** An item the person marked as handled. Its words and its message numbers identify it. */
export type Dismissed = { text: string; src: number[] }

const MAX_DISMISSED = 200

const words = (text: string): Set<string> => new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(w => w.length > 2))

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 && b.size === 0) {
    return 1
  }

  let shared = 0

  for (const w of a) {
    if (b.has(w)) {
      shared += 1
    }
  }

  return shared / (a.size + b.size - shared)
}

/**
 * True if the item is one the person already handled. The model words the same
 * item a little differently from run to run, so an item matches when most of its
 * words match, or when it cites the same messages and shares some words.
 */
export function isDismissed(item: Dismissed, list: readonly Dismissed[]): boolean {
  const w = words(item.text)

  return list.some(d => {
    const similarity = jaccard(w, words(d.text))
    const sameSources = d.src.length > 0 && d.src.length === item.src.length && [...d.src].sort().join() === [...item.src].sort().join()

    return similarity >= 0.6 || (sameSources && similarity >= 0.3)
  })
}

/** Adds an item to the handled list once. */
export function remember(list: readonly Dismissed[], item: Dismissed): Dismissed[] {
  return isDismissed(item, list) ? [...list] : [...list, { text: item.text, src: [...item.src] }].slice(-MAX_DISMISSED)
}

/** The summary without the open items the person handled: questions, tasks, failures and unproven items. */
export function withoutDismissed(s: Summary, list: readonly Dismissed[]): Summary {
  if (list.length === 0) {
    return s
  }

  return {
    ...s,
    decisions: s.decisions.filter(d => !isDismissed({ text: d.ask, src: d.src }, list)),
    failed: s.failed.filter(f => f.fixed || !isDismissed(f, list)),
    notChecked: s.notChecked.filter(n => !isDismissed(n, list)),
  }
}

/** How many open items a summary holds that a person can mark as handled. */
export function dismissibleCount(s: Summary): number {
  return s.decisions.length + s.failed.filter(f => !f.fixed).length + s.notChecked.length
}
