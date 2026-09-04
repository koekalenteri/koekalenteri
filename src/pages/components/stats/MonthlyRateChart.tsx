import { SINGLE_SERIES_CHART_COLOR } from './chartColors'
import StatsBarChart from './StatsBarChart'

export interface MonthlyRate {
  readonly month: string
  /** A percentage with one decimal, or null for a month with nothing to divide by. */
  readonly rate: number | null
}

/**
 * A share as a percentage with one decimal. A month with an empty base has no rate to speak of, so
 * it gets null rather than 0, which would read as "none at all".
 */
export const percentageOf = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null

interface Props {
  readonly emptyMessage: string
  readonly entries: MonthlyRate[]
  readonly info: string
  readonly label: string
  readonly title: string
}

/**
 * One percentage per month, as its own chart: a rate cannot share an axis with the people-counts
 * next to it, and months with wildly different entry numbers are only comparable once the count
 * is divided out.
 */
export default function MonthlyRateChart({ emptyMessage, entries, info, label, title }: Props) {
  return (
    <StatsBarChart
      title={title}
      info={info}
      emptyMessage={emptyMessage}
      isEmpty={entries.length === 0}
      chartProps={{
        colors: [SINGLE_SERIES_CHART_COLOR],
        series: [
          {
            data: entries.map((entry) => entry.rate),
            label,
            valueFormatter: (value: number | null) => (value === null ? '–' : `${value} %`),
          },
        ],
        // One series: the title already names it, so the legend box is redundant.
        slotProps: { legend: { hidden: true } },
        xAxis: [{ data: entries.map((entry) => entry.month), scaleType: 'band' }],
        yAxis: [{ valueFormatter: (value: number) => `${value} %` }],
      }}
    />
  )
}
