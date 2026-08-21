import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilState, useRecoilValue, waitForAll } from 'recoil'
import { zonedDateString } from '../../i18n/dates'
import AutocompleteSingle from '../components/AutocompleteSingle'
import OrganizerFinanceChart from '../components/stats/OrganizerFinanceChart'
import YearSelector from '../components/stats/YearSelector'
import FullPageFlex from './components/FullPageFlex'
import {
  adminAllYearlyStatsAtom,
  adminOrganizerEventStatsAtom,
  adminStatsOrganizerIdAtom,
  adminStatsOrganizersSelector,
  adminStatsYearAtom,
} from './recoil'

const CURRENT_YEAR = new Date().getFullYear()

export default function StatsPage() {
  const { t } = useTranslation()
  const [year, setYear] = useRecoilState(adminStatsYearAtom)
  const [organizerId, setOrganizerId] = useRecoilState(adminStatsOrganizerIdAtom)
  const orgs = useRecoilValue(adminStatsOrganizersSelector)
  const options = useMemo(() => [{ id: '', name: t('all') }, ...orgs], [orgs, t])

  useEffect(() => {
    if (orgs.length === 1) {
      setOrganizerId(orgs[0].id)
    } else if (!orgs.some((org) => org.id === organizerId)) {
      setOrganizerId('')
    }
  }, [orgs, organizerId, setOrganizerId])

  const [allStats, allOrganizerStats] = useRecoilValue(
    waitForAll([adminAllYearlyStatsAtom, adminOrganizerEventStatsAtom])
  )
  const years = allStats.years.includes(CURRENT_YEAR) ? allStats.years : [...allStats.years, CURRENT_YEAR]

  // Fetched once, unfiltered — the year/organizer pickers just filter this in memory.
  const organizerStats = useMemo(
    () =>
      allOrganizerStats.filter((item) => {
        if (organizerId && item.organizerId !== organizerId) return false
        return !!item.date && zonedDateString(item.date).startsWith(`${year}`)
      }),
    [allOrganizerStats, organizerId, year]
  )

  return (
    <FullPageFlex>
      <Stack spacing={4} sx={{ overflow: 'auto', p: 1, width: '100%' }}>
        <Typography variant="h4">{t('stats.title')}</Typography>

        <AutocompleteSingle
          disabled={orgs.length < 2}
          size="small"
          options={options}
          label={t('organization')}
          getOptionLabel={(o) => o.name}
          value={options.find((o) => o.id === organizerId) ?? null}
          onChange={(o) => setOrganizerId(o?.id ?? '')}
          sx={{ maxWidth: 300 }}
        />

        <YearSelector years={years} value={year} onChange={setYear} />

        <OrganizerFinanceChart items={organizerStats} />
      </Stack>
    </FullPageFlex>
  )
}
