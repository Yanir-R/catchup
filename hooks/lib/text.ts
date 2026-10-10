function clean(part: string): string {
  return part
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1$2')
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/, '')
}

/** Removes markdown emphasis, links and headings the pane would show as raw characters. Text in backticks is left alone. */
export function unmarkdown(text: string): string {
  return text
    .split(/(`[^`]*`)/)
    .map((part, i) => (i % 2 === 1 ? part : clean(part)))
    .join('')
}
