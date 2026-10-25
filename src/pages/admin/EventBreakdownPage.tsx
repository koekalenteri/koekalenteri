import DownloadOutlined from '@mui/icons-material/DownloadOutlined'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableFooter from '@mui/material/TableFooter'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { getEventClassStats } from '../../api/stats'
import { reportError } from '../../lib/client/error'
import { downloadXlsx } from '../../lib/client/xlsx'
import { currentYear, TIME_ZONE } from '../../lib/day'
import { buildEventBreakdownTable, eventBreakdownSpreadsheetRows } from '../../lib/eventBreakdown'
import { eventClassStatsSpreadsheetRows } from '../../lib/eventClassStats'
import { eventBreakdownFileName, eventClassStatsFileName } from '../../lib/fileName'
import { Path } from '../../routeConfig'
import YearSelector from '../components/stats/YearSelector'
import { allYearlyStatsAtom, idTokenAtom, isAdminAtom } from '../state'
import { adminOrganizersAtom } from './state'

export default function EventBreakdownPage() {
  const { t } = useTranslation(['translation', 'breed'])
  const isAdmin = useAtomValue(isAdminAtom)
  const token = useAtomValue(idTokenAtom)
  const allStats = useAtomValue(allYearlyStatsAtom)
  const organizers = useAtomValue(adminOrganizersAtom)
  const thisYear = currentYear(TIME_ZONE)
  const [year, setYear] = useState(thisYear)
  const [loadingClassStats, setLoadingClassStats] = useState(false)

  const years = allStats.years.includes(thisYear) ? allStats.years : [...allStats.years, thisYear]
  const yearStats = allStats.stats.find((stats) => stats.year === year)

  const organizerNames = useMemo(
    () => new Map(organizers.map((organizer) => [organizer.id, organizer.name])),
    [organizers]
  )

  const organizerName = useCallback(
    (organizerId: string) => organizerNames.get(organizerId) ?? organizerId,
    [organizerNames]
  )

  const { rows, grandTotal } = useMemo(
    () => buildEventBreakdownTable(yearStats?.eventBreakdown ?? [], organizerName),
    [organizerName, yearStats]
  )

  const downloadEventClassStats = useCallback(async () => {
    setLoadingClassStats(true)
    try {
      const classRows = await getEventClassStats(token ?? '', year)
      await downloadXlsx({
        fileName: eventClassStatsFileName(year),
        rows: eventClassStatsSpreadsheetRows(classRows, t, organizerName),
        sheetName: t('stats.admin.eventClassStatsSheet'),
      })
    } finally {
      setLoadingClassStats(false)
    }
  }, [organizerName, t, token, year])

  if (!isAdmin) return <Navigate to={Path.admin.index} replace />

  return (
    <Stack spacing={2} sx={{ p: 1, width: '100%' }}>
      <Typography variant="h1">{t('stats.admin.eventBreakdownTitle')}</Typography>
      <Typography
        sx={{
          color: 'text.secondary',
        }}
      >
        {t('stats.admin.eventBreakdownTitleInfo')}
      </Typography>

      <Stack
        direction="row"
        sx={{
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <YearSelector years={years} value={year} onChange={setYear} />
        <Button
          disabled={rows.length === 0}
          onClick={() => {
            downloadXlsx({
              fileName: eventBreakdownFileName(year),
              rows: eventBreakdownSpreadsheetRows(rows, grandTotal, t),
              sheetName: t('stats.admin.eventBreakdownTitle'),
            }).catch(reportError)
          }}
          size="small"
          startIcon={<DownloadOutlined />}
          variant="outlined"
        >
          {t('stats.admin.eventBreakdownExport')}
        </Button>
        <Button
          disabled={loadingClassStats}
          onClick={() => {
            downloadEventClassStats().catch(reportError)
          }}
          size="small"
          startIcon={<DownloadOutlined />}
          variant="outlined"
        >
          {t('stats.admin.eventClassStatsExport')}
        </Button>
      </Stack>

      {rows.length === 0 ? (
        <Typography
          sx={{
            color: 'text.secondary',
          }}
        >
          {t('stats.noDataForYear')}
        </Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('organization')}</TableCell>
              <TableCell>{t('stats.admin.eventType')}</TableCell>
              <TableCell align="right">{t('stats.admin.eventBreakdownEvents')}</TableCell>
              <TableCell align="right">{t('stats.admin.eventBreakdownPlaces')}</TableCell>
              <TableCell align="right">{t('stats.admin.eventBreakdownStarters')}</TableCell>
              <TableCell align="right">{t('stats.admin.eventBreakdownHandlers')}</TableCell>
              <TableCell align="right">{t('stats.admin.eventBreakdownReserve')}</TableCell>
              <TableCell align="right">{t('stats.admin.eventBreakdownCancelled')}</TableCell>
              <TableCell align="right">{t('stats.admin.eventBreakdownMembers')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.organizerId}#${row.eventType}`}>
                <TableCell sx={row.isSubtotal ? { fontWeight: 'bold' } : undefined}>{row.organizerName}</TableCell>
                <TableCell sx={row.isSubtotal ? { fontWeight: 'bold' } : undefined}>
                  {row.isSubtotal ? t('stats.admin.eventBreakdownTotal') : row.eventType}
                </TableCell>
                <TableCell align="right" sx={row.isSubtotal ? { fontWeight: 'bold' } : undefined}>
                  {row.eventCount}
                </TableCell>
                <TableCell align="right" sx={row.isSubtotal ? { fontWeight: 'bold' } : undefined}>
                  {row.places}
                </TableCell>
                <TableCell align="right" sx={row.isSubtotal ? { fontWeight: 'bold' } : undefined}>
                  {row.starters}
                </TableCell>
                <TableCell align="right" sx={row.isSubtotal ? { fontWeight: 'bold' } : undefined}>
                  {row.handlerCount}
                </TableCell>
                <TableCell align="right" sx={row.isSubtotal ? { fontWeight: 'bold' } : undefined}>
                  {row.reserve ?? 0}
                </TableCell>
                <TableCell align="right" sx={row.isSubtotal ? { fontWeight: 'bold' } : undefined}>
                  {row.cancelledRegistrations ?? 0}
                </TableCell>
                <TableCell align="right" sx={row.isSubtotal ? { fontWeight: 'bold' } : undefined}>
                  {row.memberStarters ?? 0}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          {grandTotal ? (
            <TableFooter>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>{t('stats.admin.eventBreakdownTotal')}</TableCell>
                <TableCell />
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {grandTotal.eventCount}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {grandTotal.places}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {grandTotal.starters}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {grandTotal.handlerCount}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {grandTotal.reserve ?? 0}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {grandTotal.cancelledRegistrations ?? 0}
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {grandTotal.memberStarters ?? 0}
                </TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      )}
    </Stack>
  )
}
