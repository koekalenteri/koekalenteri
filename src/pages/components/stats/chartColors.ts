/**
 * Fixed-order categorical palette (slots 1-3 of the validated default), used for
 * multi-series charts. Never cycle or reorder — the order is the CVD-safety mechanism.
 */
export const CATEGORICAL_CHART_COLORS = ['#2a78d6', '#eb6834', '#1baf7a'] as const

/** Single hue for nominal single-series bar charts (magnitude comparison, no ranking meaning in color). */
export const SINGLE_SERIES_CHART_COLOR = '#2a78d6'
