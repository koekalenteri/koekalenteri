import type { YearlyStatsResponse } from '../../../api/stats'
import type { BreedCode } from '../../../types/Dog'
import Typography from '@mui/material/Typography'
import { BarChart } from '@mui/x-charts/BarChart'
import { useTranslation } from 'react-i18next'
import {
  CATEGORICAL_CHART_COLORS,
  CATEGORICAL_CHART_INK,
  OTHER_BUCKET_CHART_COLOR,
  OTHER_BUCKET_CHART_INK,
} from './chartColors'

interface Props {
  readonly stats: YearlyStatsResponse[]
  /** Breeds shown individually; everything past this folds into one "other" series. */
  readonly limit?: number
}

/** Below this a stacked segment is too short to hold a readable number. */
const MIN_LABEL_HEIGHT = 18
const OTHER_SERIES_ID = 'other'

/**
 * Breed mix per year as a stacked bar per year: the distribution and how it shifts, in one read.
 *
 * The top breeds are chosen once from the all-year totals, not per year, so a breed keeps the
 * same colour in every bar — with a per-year ranking the palette would repaint itself whenever
 * two breeds swapped places, and the chart would say something it doesn't mean.
 */
export default function BreedDistributionChart({ stats, limit = 7 }: Props) {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')

  const years = stats.map((stat) => stat.year)

  const totals = new Map<string, number>()
  for (const stat of stats) {
    for (const entry of stat.breedBreakdown ?? []) {
      totals.set(entry.entityId, (totals.get(entry.entityId) ?? 0) + entry.count)
    }
  }
  const topBreeds = [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.min(limit, CATEGORICAL_CHART_COLORS.length))
    .map(([entityId]) => entityId)

  const countFor = (stat: YearlyStatsResponse, entityId: string) =>
    stat.breedBreakdown?.find((entry) => entry.entityId === entityId)?.count ?? 0

  const breedSeries = topBreeds.map((entityId) => ({
    data: stats.map((stat) => countFor(stat, entityId)),
    id: entityId,
    label: breed(entityId as BreedCode),
    stack: 'breeds',
  }))

  const otherPerYear = stats.map((stat) =>
    (stat.breedBreakdown ?? []).reduce(
      (sum, entry) => (topBreeds.includes(entry.entityId) ? sum : sum + entry.count),
      0
    )
  )
  const hasOther = otherPerYear.some((count) => count > 0)
  const series = hasOther
    ? [...breedSeries, { data: otherPerYear, id: OTHER_SERIES_ID, label: t('stats.otherBreeds'), stack: 'breeds' }]
    : breedSeries

  // Several palette slots sit under 3:1 against the chart surface, so segments big enough to
  // hold a number carry one rather than relying on colour alone. Each label takes the ink its
  // own fill can support — one blanket colour would be unreadable on half the stack.
  const labelInk = Object.fromEntries(
    series.map((s, index) => [
      `& .MuiBarLabel-series-${s.id}`,
      { fill: s.id === OTHER_SERIES_ID ? OTHER_BUCKET_CHART_INK : CATEGORICAL_CHART_INK[index] },
    ])
  )

  const isEmpty = series.length === 0 || years.length === 0

  return (
    <>
      <Typography variant="h6">{t('stats.breedDistribution')}</Typography>
      {isEmpty ? (
        <Typography color="text.secondary">{t('stats.noDataForYear')}</Typography>
      ) : (
        <BarChart
          height={420}
          colors={[...CATEGORICAL_CHART_COLORS.slice(0, breedSeries.length), OTHER_BUCKET_CHART_COLOR]}
          series={series}
          xAxis={[{ data: years, scaleType: 'band' }]}
          barLabel={(item, context) => (context.bar.height >= MIN_LABEL_HEIGHT && item.value ? `${item.value}` : null)}
          sx={labelInk}
        />
      )}
    </>
  )
}
