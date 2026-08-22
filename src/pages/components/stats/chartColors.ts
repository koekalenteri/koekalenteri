/**
 * Fixed-order categorical palette, used for multi-series charts. Never cycle or reorder —
 * the order is the CVD-safety mechanism, and a chart takes the first N slots it needs.
 *
 * Validated as a set for adjacent-pair separation (stacks, bars, lines): worst adjacent CVD
 * ΔE 9.1, worst adjacent normal-vision ΔE 19.6. Three slots (aqua, yellow, magenta) fall below
 * 3:1 contrast on a light surface, so any chart using them past slot 3 owes the reader visible
 * labels rather than colour alone. Eight is the cap: a ninth series folds into an "other" bucket.
 */
export const CATEGORICAL_CHART_COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
] as const

/** Single hue for nominal single-series bar charts (magnitude comparison, no ranking meaning in color). */
export const SINGLE_SERIES_CHART_COLOR = '#2a78d6'

/** Neutral for the "everything else" bucket — it is a remainder, not an entity, so it gets no hue. */
export const OTHER_BUCKET_CHART_COLOR = '#8a8a85'

/**
 * Ink for a label drawn *on top of* a mark of the matching colour, index-aligned with
 * CATEGORICAL_CHART_COLORS. Picked by WCAG contrast against each fill rather than by eye —
 * every entry clears 3:1, and all but the red slot clear 4.5:1. Keep in step with the palette.
 */
export const CATEGORICAL_CHART_INK = [
  '#ffffff', // on blue    4.42:1
  '#1a1a19', // on orange  5.44:1
  '#1a1a19', // on aqua    6.19:1
  '#1a1a19', // on yellow  8.04:1
  '#1a1a19', // on magenta 6.47:1
  '#ffffff', // on green   4.95:1
  '#ffffff', // on violet  8.56:1
  '#1a1a19', // on red     4.41:1
] as const

/** Ink for a label on the neutral "other" fill (5.02:1). */
export const OTHER_BUCKET_CHART_INK = '#1a1a19'

/**
 * A reference line drawn *over* bars — a ceiling, not a category, so it takes ink rather than a
 * categorical hue. Clears 3:1 against the surface and against both stacked slots it crosses
 * (3.94:1 on blue, 5.44:1 on orange), which is where it has to stay readable.
 */
export const CAPACITY_LINE_CHART_COLOR = '#1a1a19'
