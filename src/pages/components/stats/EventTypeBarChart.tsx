import type { YearlyBreakdownEntry } from '../../../types/Stats'
import Typography from '@mui/material/Typography'
import { BarChart } from '@mui/x-charts/BarChart'
import { useTranslation } from 'react-i18next'
import { OFFICIAL_EVENT_TYPES } from '../../../lib/event'
import { SINGLE_SERIES_CHART_COLOR } from './chartColors'

interface Props {
  readonly data: YearlyBreakdownEntry[] | undefined
}

export default function EventTypeBarChart({ data = [] }: Props) {
  const { t } = useTranslation()

  const countFor = (eventType: string) => data.find((entry) => entry.entityId === eventType)?.count ?? 0
  const eventTypes = OFFICIAL_EVENT_TYPES.filter((eventType) => countFor(eventType) > 0)

  if (eventTypes.length === 0) {
    return (
      <>
        <Typography variant="h6">{t('stats.eventTypeDistribution')}</Typography>
        <Typography color="text.secondary">{t('stats.noDataForYear')}</Typography>
      </>
    )
  }

  return (
    <>
      <Typography variant="h6">{t('stats.eventTypeDistribution')}</Typography>
      <BarChart
        height={320}
        colors={[SINGLE_SERIES_CHART_COLOR]}
        xAxis={[{ data: eventTypes, scaleType: 'band' }]}
        series={[{ data: eventTypes.map(countFor), label: t('stats.participationCount') }]}
        slotProps={{ legend: { hidden: true } }}
      />
    </>
  )
}
