/** Checks on the model's text that code can do: quoted names exist, sentences stay short. */

const MAX_WORDS = 25

/** Backticked names in `text` that do not occur in the messages the model was shown. */
export function ungrounded(text: string, source: string): string[] {
  const found: string[] = []

  for (const m of text.matchAll(/`([^`\n]+)`/g)) {
    if (!source.includes(m[1])) {
      found.push(m[1])
    }
  }

  return found
}

/** Sentences longer than the limit, which the Simplified Technical English rules do not allow. */
export function longSentences(text: string, maxWords = MAX_WORDS): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter(sentence => sentence.trim().split(/\s+/).length > maxWords)
}

/** A proof that names no number, file, command or message shows nothing. */
export function vagueProofs(done: ReadonlyArray<{ text: string; proof: string | null }>): string[] {
  return done
    .filter(d => d.proof !== null && !/[0-9`#]/.test(d.proof))
    .map(d => `The proof for "${d.text.slice(0, 60)}" is vague. Name the number, file, command or message that shows it.`)
}

/** The problems in a list of texts, as lines the model can act on. */
export function issuesOf(texts: readonly string[], source: string): string[] {
  const issues: string[] = []

  for (const text of texts) {
    for (const name of ungrounded(text, source)) {
      issues.push(`The name \`${name}\` is not in the messages. Remove it or use the exact text from the messages.`)
    }

    for (const sentence of longSentences(text)) {
      issues.push(`This sentence is too long (more than ${MAX_WORDS} words): "${sentence.slice(0, 80)}". Split it.`)
    }
  }

  return issues
}

/** Marks a quoted name that is not in the source with (?), so it is never read as fact. */
export function mark(text: string, source: string): string {
  return ungrounded(text, source).reduce((out, name) => out.replace(`\`${name}\``, `\`${name}\` (?)`), text)
}
