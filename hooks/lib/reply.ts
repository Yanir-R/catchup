/** What placing a text in the prompt box needs from the engine. The caller owns the engine, so it supplies these. */
export type ReplyIo = {
  read: () => Promise<{ text: string }>
  fill: (input: { text: string; mode: 'replace' | 'append' }) => Promise<{ isFilled: boolean }>
  copy: (text: string) => Promise<{ isCopied: boolean }>
  toast: (message: string) => void
}

/**
 * Puts the reply template in the prompt box, so it appears in full and can be
 * edited in place: a pasted text of many lines is folded into "[Pasted text +N
 * lines]", a filled draft is not. A draft the person already typed is kept.
 * If the box cannot take it (a dialog holds the keys), the text goes to the
 * clipboard and the person is told.
 */
export async function placeReply(io: ReplyIo, text: string): Promise<'filled' | 'copied' | 'failed'> {
  const box = await io.read()
  const hasDraft = box.text.trim() !== ''
  const filled = await io.fill(hasDraft ? { text: `\n\n${text}`, mode: 'append' } : { text, mode: 'replace' })

  if (filled.isFilled) {
    io.toast('The reply template is in the prompt box. Type each answer after "Answer:", then press Enter.')

    return 'filled'
  }

  const copied = await io.copy(text)
  io.toast(copied.isCopied ? 'The prompt box is busy, so the template is on the clipboard. Paste it with Ctrl+V.' : 'Could not place the template.')

  return copied.isCopied ? 'copied' : 'failed'
}
