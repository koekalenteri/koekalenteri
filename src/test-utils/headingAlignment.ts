/**
 * Three pixels, not one: the two platforms measure a line's middle a little differently — 2.1px out
 * on Linux where macOS reads 1.6 for the same layout — and the mistake this guards against was 4.4.
 */
export const ARROW_TOLERANCE = 3

/**
 * How far an icon's middle sits from the middle of a heading's **first** line.
 *
 * A control the size of an arrow beside a heading three times its size makes this easy to get wrong.
 * Aligning the two on their text baselines leaves the arrow 4.4px low, and centring it on the
 * heading's box leaves it 14px low as soon as the heading wraps — it centres on the block, not on
 * the line the arrow belongs to (KOE-541). Hence the first line, measured through a Range: a wrapped
 * heading is taller than the line its arrow sits on.
 */
export const iconOffsetFromHeadingLine = (container: Element, heading: Element) => {
  const icon = container.querySelector('svg')
  if (!icon) throw new Error('no icon in the container')

  const range = document.createRange()
  range.selectNodeContents(heading)
  const firstLine = range.getClientRects()[0]
  if (!firstLine) throw new Error('the heading has no laid-out text')

  const iconBox = icon.getBoundingClientRect()
  return (iconBox.top + iconBox.bottom) / 2 - (firstLine.top + firstLine.bottom) / 2
}
