import type { Line, Section } from './render'

/** How a line is drawn. Colors are theme keys, so they follow the person's theme. */
export type Look = { color?: string; bold?: boolean; inverse?: boolean; dim?: boolean }

const COLOR: Record<Section, string> = {
  needs: 'warning',
  failed: 'error',
  done: 'success',
  fixed: 'inactive',
  running: 'permission',
  unchecked: 'remember',
  decided: 'merged',
  next: 'suggestion',
}

// A symbol beside each label keeps the sections apart in a terminal with no color.
const SYMBOL: Record<Section, string> = {
  needs: '▶',
  failed: '✖',
  done: '✔',
  fixed: '↻',
  running: '●',
  unchecked: '?',
  decided: '◆',
  next: '→',
}

/** What the reader should look at first stands out most: NEEDS YOU is a solid bar, Next is bold. */
export function lookOf(line: Line): Look {
  const color = line.section === undefined ? undefined : COLOR[line.section]

  switch (line.tone) {
    case 'head':
      return { bold: true }
    case 'label':
      return { bold: true, color, inverse: line.section === 'needs' || line.section === 'failed' }
    case 'warn':
      return { bold: true, color: 'warning' }
    case 'rec':
      return { bold: true, color: 'success' }
    case 'sub':
    case 'dim':
      return { dim: true }
    case 'item':
      if (line.section === 'needs') {
        return { bold: true }
      }

      return line.section === 'next' ? { bold: true, color } : {}
  }
}

/** The text as the pane shows it: symbols on labels and on the next step, an indent on details. */
export function display(line: Line): string {
  if (line.tone === 'label' && line.section !== undefined) {
    return ` ${SYMBOL[line.section]} ${line.text} `
  }

  if (line.section === 'next') {
    return `${SYMBOL.next} ${line.text}`
  }

  return line.tone === 'sub' || line.tone === 'rec' ? `   ${line.text}` : line.text
}
