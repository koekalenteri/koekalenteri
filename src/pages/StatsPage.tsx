import type { YearlyStatsResponse } from '../api/stats'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useSearchParams } from 'react-router'
import { HEADER_HEIGHT } from '../assets/Theme'
import { rum } from '../lib/client/rum'
import Header from './components/Header'
import DogHandlerBucketChart from './components/stats/DogHandlerBucketChart'
import EventTypeBarChart from './components/stats/EventTypeBarChart'
import ParticipationTrendChart from './components/stats/ParticipationTrendChart'
import TopBreedsBarChart from './components/stats/TopBreedsBarChart'
import YearSelector from './components/stats/YearSelector'
import { allYearlyStatsAtom } from './state'

const CURRENT_YEAR = new Date().getFullYear()
const EMPTY_YEAR_STATS: YearlyStatsResponse = { dogHandlerBuckets: [], totals: [], year: CURRENT_YEAR }

export function Component() {
  const { t } = useTranslation()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedYear = Number(searchParams.get('year')) || CURRENT_YEAR

  useEffect(() => {
    rum()?.recordPageView(location.pathname)
  }, [location])

  // The all-years response already carries every year's breakdowns, so picking the selected
  // year out of it avoids a second request that would recompute what we just received.
  const allStats = useAtomValue(allYearlyStatsAtom)
  const yearStats = useMemo(
    () => allStats.stats.find((stats) => stats.year === selectedYear) ?? EMPTY_YEAR_STATS,
    [allStats.stats, selectedYear]
  )
  const years = allStats.years.includes(CURRENT_YEAR) ? allStats.years : [...allStats.years, CURRENT_YEAR]

  return (
    <>
      <Header />
      <Box sx={{ mt: HEADER_HEIGHT, overflow: 'auto', p: 2 }}>
        <Typography variant="h4" gutterBottom>
          {t('stats.title')}
        </Typography>

        <Stack spacing={4}>
          {allStats.stats.length > 0 ? <ParticipationTrendChart stats={allStats.stats} /> : null}

          <YearSelector years={years} value={selectedYear} onChange={(year) => setSearchParams({ year: `${year}` })} />

          <Grid container spacing={4}>
            <Grid size={{ md: 6, xs: 12 }}>
              <EventTypeBarChart data={yearStats.eventTypeBreakdown} />
            </Grid>
            <Grid size={{ md: 6, xs: 12 }}>
              <DogHandlerBucketChart data={yearStats.dogHandlerBuckets} />
            </Grid>
            <Grid size={12}>
              <TopBreedsBarChart data={yearStats.breedBreakdown} />
            </Grid>
          </Grid>
        </Stack>
      </Box>
    </>
  )
}

Component.displayName = 'StatsPage'
