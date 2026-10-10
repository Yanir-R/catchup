/** Options of an open decision and the one an agent recommended. */

export const letter = (i: number): string => String.fromCharCode(65 + i)

const norm = (text: string): string => text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

// An agent marks its pick with a word beside the option.
const MARK = /\s*(?:[(\[]\s*(?:recommended|my pick|preferred|suggested|best)\s*[)\]]|[⭐★☆]\s*(?:recommended)?|\brecommended\b\s*$)/i

/** An option without a letter or number the model put in front of it ("A) Publish" is "Publish"). Code adds the letters. */
export function stripLead(option: string): string {
  return option.replace(/^\(?[A-Za-z0-9]{1,2}[.)]\s+|^[A-F]:\s+/, '').trim()
}

/** The option text without markdown, a description after a dash, or a recommendation mark. */
export function cleanOption(raw: string): { label: string; isMarked: boolean } {
  const isMarked = MARK.test(raw)
  const label = raw
    .replace(MARK, '')
    .replace(/\*\*|__/g, '')
    .split(/\s+[—–-]\s+|:\s+/)[0]
    .replace(/\s+/g, ' ')
    .replace(/[.;,]+$/, '')
    .trim()
    .slice(0, 100)

  return { label, isMarked }
}

/**
 * Which option the recommendation names, or -1. It matches by letter ("B",
 * "option B"), by number ("2", "option 2"), or by the option's own words.
 */
export function recommendedIndex(options: readonly string[], recommend: string | null): number {
  if (recommend === null || options.length === 0) {
    return -1
  }

  const text = norm(recommend)
  const pointer = /^(?:option |choice |approach |plan )?([a-z]|\d{1,2})$/.exec(text)

  if (pointer !== null) {
    const key = pointer[1]
    const byNumber = /^\d+$/.test(key) ? Number(key) - 1 : -1
    const at = byNumber >= 0 ? byNumber : key.charCodeAt(0) - 97

    return at >= 0 && at < options.length ? at : -1
  }

  const hits = options.map((o, i) => ({ i, n: norm(stripLead(o)) })).filter(o => o.n.length >= 3 && (text === o.n || text.includes(o.n)))

  // Several options named in one sentence say nothing about which one is the pick.
  return hits.length === 1 ? hits[0].i : -1
}

/** "A) SQLite ★  B) Postgres": the recommended option carries a star. */
export function optionsText(options: readonly string[], recommend: string | null, m: (text: string) => string = t => t): string {
  const pick = recommendedIndex(options, recommend)

  return options.map((o, i) => `${letter(i)}) ${m(stripLead(o))}${i === pick ? ' ★' : ''}`).join('  ')
}
