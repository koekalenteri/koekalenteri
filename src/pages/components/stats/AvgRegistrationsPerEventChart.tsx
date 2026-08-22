import type { YearlyStatsResponse } from '../../../api/stats'
import Typography from '@mui/material/Typography'
import { LineChart } from '@mui/x-charts/LineChart'
import { useTranslation } from 'react-i18next'
import { SINGLE_SERIES_CHART_COLOR } from './chartColors'

interface Props {
  readonly stats: YearlyStatsResponse[]
}

const totalRegistrations = (stat: YearlyStatsResponse): number =>
  (stat.eventTypeBreakdown ?? []).reduce((sum, entry) => sum + entry.count, 0)

const eventCount = (stat: YearlyStatsResponse): number =>
  stat.totals.find((total) => total.type === 'event')?.count ?? 0

/**
 * Average registrations per event, per year -- a proxy for how well events fill up over time.
 * Years without an 'event' total yet (backend not rebuilt since this stat was added, or no
 * events at all) are dropped rather than shown as zero, which would misread as "nobody entered".
 */
export default function AvgRegistrationsPerEventChart({ stats }: Props) {
  const { t } = useTranslation()

  const entries = stats.filter((stat) => eventCount(stat) > 0)

  return (
    <>
      <Typography variant="h6">{t('stats.avgRegistrationsPerEvent')}</Typography>
      {entries.length === 0 ? (
        <Typography color="text.secondary">{t('stats.noDataForYear')}</Typography>
      ) : (
        <LineChart
          height={320}
          colors={[SINGLE_SERIES_CHART_COLOR]}
          xAxis={[{ data: entries.map((stat) => stat.year), scaleType: 'point' }]}
          series={[
            {
              data: entries.map((stat) => totalRegistrations(stat) / eventCount(stat)),
              label: t('stats.avgRegistrationsPerEvent'),
            },
          ]}
        />
      )}
    </>
  )
}
