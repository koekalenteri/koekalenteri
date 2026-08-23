import type { YearlyBreakdownEntry } from '../../../types/Stats'
import { useTranslation } from 'react-i18next'
import { REG_CLASSES } from '../../../lib/registration'
import { SINGLE_SERIES_CHART_COLOR } from './chartColors'
import StatsBarChart from './StatsBarChart'

const REGISTRATION_CLASSES = [...REG_CLASSES]

interface Props {
  readonly data: YearlyBreakdownEntry[] | undefined
}

export default function ClassDistributionChart({ data = [] }: Props) {
  const { t } = useTranslation()

  const countFor = (registrationClass: string) => data.find((entry) => entry.entityId === registrationClass)?.count ?? 0
  const classes = REGISTRATION_CLASSES.filter((registrationClass) => countFor(registrationClass) > 0)

  return (
    <StatsBarChart
      title={t('stats.classDistribution')}
      info={t('stats.classDistributionInfo')}
      emptyMessage={t('stats.noDataForYear')}
      isEmpty={classes.length === 0}
      chartProps={{
        colors: [SINGLE_SERIES_CHART_COLOR],
        series: [{ data: classes.map(countFor), label: t('stats.participationCount') }],
        slotProps: { legend: { hidden: true } },
        xAxis: [{ data: classes, scaleType: 'band' }],
      }}
    />
  )
}
