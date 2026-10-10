const MAX_COUNT = 500

const PHRASE =
  /^\s*\/?(?:brief me|catch ?up|catch me up|what did i miss)(?:\s+(?:on\s+)?(?:the\s+)?(?:last\s+)?(\d{1,4}))?(?:\s+messages?)?\s*[.!?]?\s*$/i

export type Request = { n: number | null }

function clamp(n: number): number {
  return Math.min(MAX_COUNT, Math.max(1, n))
}

/** A whole prompt that asks for a catch-up. A sentence that only contains the words does not match. */
export function matchPhrase(text: string): Request | null {
  const m = PHRASE.exec(text)

  if (m === null) {
    return null
  }

  return { n: m[1] === undefined ? null : clamp(Number(m[1])) }
}

/** The text after `/catchup`: empty, or a count. */
export function parseArgs(args: string): Request | { error: string } {
  const text = args.trim()

  if (text === '') {
    return { n: null }
  }

  const m = /^(\d{1,4})(?:\s+messages?)?$/i.exec(text)

  if (m === null) {
    return { error: 'Usage: /catchup [number of messages]' }
  }

  return { n: clamp(Number(m[1])) }
}
