/** Message numbers as a short tag: one or two are listed, more become a range with a count. */
export function ref(src: readonly number[]): string {
  if (src.length === 0) {
    return ''
  }

  const sorted = [...src].sort((a, b) => a - b)

  if (sorted.length <= 2) {
    return ' [' + sorted.map(n => '#' + n).join(', ') + ']'
  }

  return ' [#' + sorted[0] + '–#' + sorted[sorted.length - 1] + ' · ' + sorted.length + ' msgs]'
}
