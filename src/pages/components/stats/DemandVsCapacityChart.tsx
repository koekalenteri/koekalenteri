import type { CapacityStatsEntry } from '../../../types/Stats'
import Typography from '@mui/material/Typography'
import {
  BarPlot,
  ChartsAxisHighlight,
  ChartsGrid,
  ChartsLegend,
  ChartsTooltip,
  ChartsXAxis,
  ChartsYAxis,
  LinePlot,
  MarkPlot,
  ResponsiveChartContainer,
} from '@mui/x-charts'
import { useTranslation } from 'react-i18next'
import { ALL_CLASSES_ID } from './CapacityUtilizationChart'
import { CAPACITY_LINE_CHART_COLOR, CATEGORICAL_CHART_COLORS } from './chartColors'

interface Props {
  readonly data: CapacityStatsEntry[]
  readonly classKey: string
}

interface MonthTotals {
  month: string
  reserve: number
  places: number
  starters: number
}

/** Sums the demand/supply figures per month, across whatever classes and event types are in view. */
const sumByMonth = (data: CapacityStatsEntry[]): MonthTotals[] => {
  const totals = new Map<string, MonthTotals>()
  for (const entry of data) {
    const total = totals.get(entry.month) ?? { month: entry.month, places: 0, reserve: 0, starters: 0 }
    total.places += entry.places
    total.reserve += entry.reserve
    total.starters += entry.starters
    totals.set(entry.month, total)
  }
  return [...totals.values()].sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * Demand against supply, per month: starters and the waiting list stacked as one bar, with the
 * available places drawn over them as a line.
 *
 * Both bars are people, so they share one axis and stack honestly; places is a different kind of
 * quantity (a ceiling, not a count of who turned up) and would misread as a third stacked
 * segment, so it is a line instead. Where the line dips below the bar, demand was turned away —
 * which is the whole question this chart exists to answer.
 */
export default function DemandVsCapacityChart({ data, classKey }: Props) {
  const { t } = useTranslation()

  const entries = sumByMonth(classKey === ALL_CLASSES_ID ? data : data.filter((entry) => entry.class === classKey))

  if (entries.length === 0) {
    return (
      <>
        <Typography variant="h6">{t('stats.admin.demandTitle')}</Typography>
        <Typography color="text.secondary">{t('stats.admin.noCapacityData')}</Typography>
      </>
    )
  }

  const months = entries.map((entry) => entry.month)

  return (
    <>
      <Typography variant="h6">{t('stats.admin.demandTitle')}</Typography>
      <ResponsiveChartContainer
        height={340}
        series={[
          {
            color: CATEGORICAL_CHART_COLORS[0],
            data: entries.map((entry) => entry.starters),
            label: t('stats.admin.starters'),
            stack: 'demand',
            type: 'bar',
          },
          {
            color: CATEGORICAL_CHART_COLORS[1],
            data: entries.map((entry) => entry.reserve),
            label: t('stats.admin.reserve'),
            stack: 'demand',
            type: 'bar',
          },
          {
            color: CAPACITY_LINE_CHART_COLOR,
            // Stepped, not smoothed: capacity is a constant within each month that jumps between
            // them. The default curve would draw places gliding from 40 to 60 across April, a
            // number that never existed.
            curve: 'step',
            data: entries.map((entry) => entry.places),
            label: t('stats.admin.places'),
            type: 'line',
          },
        ]}
        xAxis={[{ data: months, id: 'months', scaleType: 'band' }]}
        yAxis={[{ id: 'people' }]}
      >
        <ChartsGrid horizontal />
        <BarPlot />
        <LinePlot />
        <MarkPlot />
        <ChartsXAxis axisId="months" />
        <ChartsYAxis axisId="people" />
        <ChartsAxisHighlight x="band" />
        <ChartsTooltip trigger="axis" />
        <ChartsLegend />
      </ResponsiveChartContainer>
    </>
  )
}
