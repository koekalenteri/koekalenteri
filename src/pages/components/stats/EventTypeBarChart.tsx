import type { YearlyBreakdownEntry } from '../../../types/Stats'
import { useTranslation } from 'react-i18next'
import { OFFICIAL_EVENT_TYPES } from '../../../lib/event'
import { SINGLE_SERIES_CHART_COLOR } from './chartColors'
import StatsBarChart from './StatsBarChart'

interface Props {
  readonly data: YearlyBreakdownEntry[] | undefined
}

export default function EventTypeBarChart({ data = [] }: Props) {
  const { t } = useTranslation()

  const countFor = (eventType: string) => data.find((entry) => entry.entityId === eventType)?.count ?? 0
  const eventTypes = OFFICIAL_EVENT_TYPES.filter((eventType) => countFor(eventType) > 0)

  return (
    <StatsBarChart
      title={t('stats.eventTypeDistribution')}
      info={t('stats.eventTypeDistributionInfo')}
      emptyMessage={t('stats.noDataForYear')}
      isEmpty={eventTypes.length === 0}
      chartProps={{
        colors: [SINGLE_SERIES_CHART_COLOR],
        hideLegend: true,
        series: [{ data: eventTypes.map(countFor), label: t('stats.participationCount') }],
        xAxis: [{ data: eventTypes, scaleType: 'band' }],
      }}
    />
  )
}
