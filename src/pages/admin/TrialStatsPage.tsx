import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableFooter from '@mui/material/TableFooter'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { Path } from '../../routeConfig'
import { ALL_EVENT_TYPES_FOR_CAPACITY } from '../../types/Stats'
import YearSelector from '../components/stats/YearSelector'
import { allYearlyStatsAtom, isAdminAtom } from '../state'

const CURRENT_YEAR = new Date().getFullYear()

export default function TrialStatsPage() {
  const { t } = useTranslation()
  const isAdmin = useAtomValue(isAdminAtom)
  const allStats = useAtomValue(allYearlyStatsAtom)
  const [year, setYear] = useState(CURRENT_YEAR)

  const years = allStats.years.includes(CURRENT_YEAR) ? allStats.years : [...allStats.years, CURRENT_YEAR]
  const yearStats = allStats.stats.find((stats) => stats.year === year)

  // The nightly rebuild also writes a cross-type total keyed by ALL_EVENT_TYPES_FOR_CAPACITY,
  // whose handler count is deduplicated across event types -- summing the per-type rows would
  // double-count a handler who competed in more than one event type the same year.
  const { rows, total } = useMemo(() => {
    const entries = yearStats?.trialStats ?? []
    return {
      rows: entries
        .filter((entry) => entry.eventType !== ALL_EVENT_TYPES_FOR_CAPACITY)
        .sort((a, b) => a.eventType.localeCompare(b.eventType)),
      total: entries.find((entry) => entry.eventType === ALL_EVENT_TYPES_FOR_CAPACITY),
    }
  }, [yearStats])

  if (!isAdmin) return <Navigate to={Path.admin.index} replace />

  return (
    <Stack spacing={2} sx={{ p: 1, width: '100%' }}>
      <Typography variant="h4">{t('stats.admin.trialStatsTitle')}</Typography>
      <Typography color="text.secondary">{t('stats.admin.trialStatsTitleInfo')}</Typography>

      <YearSelector years={years} value={year} onChange={setYear} />

      {rows.length === 0 ? (
        <Typography color="text.secondary">{t('stats.noDataForYear')}</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('stats.admin.eventType')}</TableCell>
              <TableCell align="right">{t('stats.admin.trialStatsEvents')}</TableCell>
              <TableCell align="right">{t('stats.admin.trialStatsPlaces')}</TableCell>
              <TableCell align="right">{t('stats.admin.trialStatsStarters')}</TableCell>
              <TableCell align="right">{t('stats.admin.trialStatsHandlers')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.eventType}>
                <TableCell>{row.eventType}</TableCell>
                <TableCell align="right">{row.eventCount}</TableCell>
                <TableCell align="right">{row.places}</TableCell>
                <TableCell align="right">{row.starters}</TableCell>
                <TableCell align="right">{row.handlerCount}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          {total ? (
            <TableFooter>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>{t('stats.admin.trialStatsTotal')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {total.eventCount}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {total.places}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {total.starters}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {total.handlerCount}
                </TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      )}
    </Stack>
  )
}
