import type { CapacityStatsEntry } from '../../../types/Stats'
import Typography from '@mui/material/Typography'
import { LineChart } from '@mui/x-charts/LineChart'
import { useTranslation } from 'react-i18next'
import { SINGLE_SERIES_CHART_COLOR } from './chartColors'

interface Props {
  readonly data: CapacityStatsEntry[]
}

interface YearTotals {
  places: number
  starters: number
}

/**
 * Starters as a share of available places, per year, nationwide across every event type.
 *
 * A single event type's places are set by competition rules, so raw registration counts mostly
 * just reflect the rule rather than demand. Dividing by places instead says how full events
 * actually ran, which is what "popularity over time" should mean.
 */
const fillRateByYear = (data: CapacityStatsEntry[]): { year: number; rate: number }[] => {
  const totals = new Map<number, YearTotals>()
  for (const entry of data) {
    const year = Number(entry.month.slice(0, 4))
    const total = totals.get(year) ?? { places: 0, starters: 0 }
    total.places += entry.places
    total.starters += entry.starters
    totals.set(year, total)
  }
  return [...totals.entries()]
    .filter(([, total]) => total.places > 0)
    .map(([year, total]) => ({ rate: Math.round((total.starters / total.places) * 1000) / 10, year }))
    .sort((a, b) => a.year - b.year)
}

export default function FillRateChart({ data }: Props) {
  const { t } = useTranslation()

  const entries = fillRateByYear(data)

  return (
    <>
      <Typography variant="h6">{t('stats.fillRate')}</Typography>
      {entries.length === 0 ? (
        <Typography color="text.secondary">{t('stats.noDataForYear')}</Typography>
      ) : (
        <LineChart
          height={320}
          colors={[SINGLE_SERIES_CHART_COLOR]}
          xAxis={[{ data: entries.map((entry) => entry.year), scaleType: 'point' }]}
          yAxis={[{ valueFormatter: (value: number) => `${value} %` }]}
          series={[
            {
              data: entries.map((entry) => entry.rate),
              label: t('stats.fillRate'),
              valueFormatter: (value: number | null) => (value === null ? '–' : `${value} %`),
            },
          ]}
        />
      )}
    </>
  )
}
