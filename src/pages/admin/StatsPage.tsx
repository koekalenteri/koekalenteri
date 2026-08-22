import type { Language } from '../../types'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilState, useRecoilValue } from 'recoil'
import { zonedDateString } from '../../i18n/dates'
import AutocompleteSingle from '../components/AutocompleteSingle'
import CapacityUtilizationChart from '../components/stats/CapacityUtilizationChart'
import OrganizerFinanceChart from '../components/stats/OrganizerFinanceChart'
import YearSelector from '../components/stats/YearSelector'
import FullPageFlex from './components/FullPageFlex'
import {
  adminActiveEventTypesSelector,
  adminCapacityStatsAtom,
  adminCapacityStatsEventTypeAtom,
  adminOrganizerEventStatsAtom,
  adminStatsOrganizerIdAtom,
  adminStatsOrganizersSelector,
  adminStatsYearAtom,
} from './recoil'

const CURRENT_YEAR = new Date().getFullYear()

export default function StatsPage() {
  const { t, i18n } = useTranslation()
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

  const allOrganizerStats = useRecoilValue(adminOrganizerEventStatsAtom)

  // Derived from the stats already loaded rather than from /stats: the global year list would
  // cost four queries per year, and years with no events of your own are not selectable anyway.
  const years = useMemo(() => {
    const found = new Set(
      allOrganizerStats.flatMap((item) => (item.date ? [Number(zonedDateString(item.date).slice(0, 4))] : []))
    )
    found.add(CURRENT_YEAR)
    return [...found].filter((year) => !Number.isNaN(year)).sort((a, b) => a - b)
  }, [allOrganizerStats])

  // Fetched once, unfiltered — the year/organizer pickers just filter this in memory.
  const organizerStats = useMemo(
    () =>
      allOrganizerStats.filter((item) => {
        if (organizerId && item.organizerId !== organizerId) return false
        return !!item.date && zonedDateString(item.date).startsWith(`${year}`)
      }),
    [allOrganizerStats, organizerId, year]
  )

  const eventTypes = useRecoilValue(adminActiveEventTypesSelector)
  const eventTypeOptions = useMemo(
    () => eventTypes.map((et) => ({ id: et.eventType, name: et.description[i18n.language as Language] })),
    [eventTypes, i18n.language]
  )
  const [capacityEventType, setCapacityEventType] = useRecoilState(adminCapacityStatsEventTypeAtom)
  const capacityStats = useRecoilValue(adminCapacityStatsAtom(capacityEventType))

  const capacityClasses = useMemo(
    () => [...new Set(capacityStats.map((entry) => entry.class))].sort((a, b) => a.localeCompare(b)),
    [capacityStats]
  )
  // Falls back to the first available class whenever the explicit pick isn't (or is no longer) valid.
  const [selectedCapacityClass, setSelectedCapacityClass] = useState<string>()
  const capacityClass =
    selectedCapacityClass && capacityClasses.includes(selectedCapacityClass)
      ? selectedCapacityClass
      : (capacityClasses[0] ?? '')
  const capacityClassOptions = useMemo(() => capacityClasses.map((c) => ({ id: c, name: c })), [capacityClasses])

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

        <Stack direction="row" spacing={2}>
          <AutocompleteSingle
            size="small"
            options={eventTypeOptions}
            label={t('stats.admin.eventType')}
            getOptionLabel={(o) => o.name}
            value={eventTypeOptions.find((o) => o.id === capacityEventType) ?? null}
            onChange={(o) => setCapacityEventType(o?.id ?? '')}
            sx={{ maxWidth: 300 }}
          />
          <AutocompleteSingle
            disabled={capacityClassOptions.length < 2}
            size="small"
            options={capacityClassOptions}
            label={t('stats.admin.class')}
            getOptionLabel={(o) => o.name}
            value={capacityClassOptions.find((o) => o.id === capacityClass) ?? null}
            onChange={(o) => setSelectedCapacityClass(o?.id ?? '')}
            sx={{ maxWidth: 300 }}
          />
        </Stack>

        {capacityEventType && <CapacityUtilizationChart data={capacityStats} classKey={capacityClass} />}
      </Stack>
    </FullPageFlex>
  )
}
