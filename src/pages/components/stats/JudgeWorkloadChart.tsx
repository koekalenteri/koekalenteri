import type { JudgeWorkloadEntry } from '../../../types/Stats'
import { useTranslation } from 'react-i18next'
import { SINGLE_SERIES_CHART_COLOR } from './chartColors'
import StatsBarChart from './StatsBarChart'

interface Props {
  readonly data: JudgeWorkloadEntry[]
}

/** How many events each judge officiated in the selected year, busiest first. */
export default function JudgeWorkloadChart({ data }: Props) {
  const { t } = useTranslation()

  const entries = [...data].sort((a, b) => b.count - a.count)
  const nameById = new Map(entries.map((entry) => [entry.judgeId, entry.name]))

  return (
    <StatsBarChart
      title={t('stats.admin.judgeWorkloadTitle')}
      info={t('stats.admin.judgeWorkloadTitleInfo')}
      emptyMessage={t('stats.admin.noJudgeData')}
      isEmpty={entries.length === 0}
      chartProps={{
        colors: [SINGLE_SERIES_CHART_COLOR],
        series: [{ data: entries.map((entry) => entry.count), label: t('stats.admin.judgedEvents') }],
        slotProps: { legend: { hidden: true } },
        // Bands are keyed by judgeId: names are not unique (two judges can share one, and the
        // same person can appear id-keyed and name-keyed), and the band scale dedupes its
        // domain, which would shift bars onto the wrong judges.
        xAxis: [
          {
            data: entries.map((entry) => entry.judgeId),
            scaleType: 'band',
            valueFormatter: (judgeId: string) => nameById.get(judgeId) ?? judgeId,
          },
        ],
      }}
    />
  )
}
