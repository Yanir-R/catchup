import type { SessionMessage } from 'claude-code'

/** What a transcript row reported about itself. */
export type Row = {
  snip: string
  toolUseId: string
  isOnScreen: boolean
}

function hitsOf(row: Row, messages: readonly SessionMessage[]): number[] {
  const hits: number[] = []

  messages.forEach((m, i) => {
    const isHit =
      row.toolUseId !== ''
        ? m.toolUses.some(t => t.tool_use_id === row.toolUseId)
        : row.snip !== '' && m.text.includes(row.snip)

    if (isHit) {
      hits.push(i)
    }
  })

  return hits
}

/**
 * The index of the lowest message with a row on screen, or null when no row
 * on screen can be placed. A row whose text matches one message places itself.
 * A row that matches several (messages quote each other) takes the match
 * closest to the rows that placed themselves.
 */
export function lowestVisible(rows: readonly Row[], messages: readonly SessionMessage[]): number | null {
  const sure: number[] = []
  const unsure: number[][] = []

  for (const row of rows) {
    if (!row.isOnScreen) {
      continue
    }

    const hits = hitsOf(row, messages)

    if (hits.length === 1) {
      sure.push(hits[0])
    } else if (hits.length > 1) {
      unsure.push(hits)
    }
  }

  if (sure.length === 0) {
    return null
  }

  const anchor = Math.max(...sure)
  let lowest = anchor

  for (const hits of unsure) {
    const nearest = hits.reduce((a, b) => (Math.abs(b - anchor) < Math.abs(a - anchor) ? b : a))
    lowest = Math.max(lowest, nearest)
  }

  return lowest
}

/** How many messages come after the lowest row on screen, or null when unknown. */
export function countBelow(rows: readonly Row[], messages: readonly SessionMessage[]): number | null {
  const lowest = lowestVisible(rows, messages)

  return lowest === null ? null : messages.length - 1 - lowest
}
