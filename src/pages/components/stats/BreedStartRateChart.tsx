import type { BreedStartRateEntry } from '../../../types/Stats'
import { useTranslation } from 'react-i18next'
import { SINGLE_SERIES_CHART_COLOR } from './chartColors'
import StatsBarChart from './StatsBarChart'
import { useBreedAbbreviation } from './useBreedAbbreviation'

interface Props {
  readonly data: BreedStartRateEntry[] | undefined
}

/** Busiest breed first, so the chart reads most-to-least common rather than by abbreviation. */
const totalFor = (entry: BreedStartRateEntry) => entry.starters + entry.reserve

export default function BreedStartRateChart({ data = [] }: Props) {
  const { t } = useTranslation()
  const abbreviateBreed = useBreedAbbreviation()

  const entries = data
    .filter((entry) => totalFor(entry) > 0)
    .sort((a, b) => totalFor(b) - totalFor(a) || a.entityId.localeCompare(b.entityId))

  const rateFor = (entry: BreedStartRateEntry) => Math.round((entry.starters / totalFor(entry)) * 1000) / 10

  return (
    <StatsBarChart
      title={t('stats.breedStartRate')}
      info={t('stats.breedStartRateInfo')}
      emptyMessage={t('stats.noDataForYear')}
      isEmpty={entries.length === 0}
      chartProps={{
        colors: [SINGLE_SERIES_CHART_COLOR],
        series: [
          {
            data: entries.map(rateFor),
            label: t('stats.breedStartRate'),
            valueFormatter: (value: number | null) => (value === null ? '–' : `${value} %`),
          },
        ],
        slotProps: { legend: { hidden: true } },
        xAxis: [{ data: entries.map((entry) => abbreviateBreed(entry.entityId)), scaleType: 'band' }],
        yAxis: [{ valueFormatter: (value: number) => `${value} %` }],
      }}
    />
  )
}
