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
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate } from 'react-router'
import { downloadXlsx } from '../../lib/client/xlsx'
import { trialStatsFileName } from '../../lib/fileName'
import { buildTrialStatsTable, trialStatsSpreadsheetRows } from '../../lib/trialStats'
import { Path } from '../../routeConfig'
import YearSelector from '../components/stats/YearSelector'
import { allYearlyStatsAtom, isAdminAtom } from '../state'
import { adminOrganizersAtom } from './state'

const CURRENT_YEAR = new Date().getFullYear()

export default function TrialStatsPage() {
  const { t } = useTranslation()
  const isAdmin = useAtomValue(isAdminAtom)
  const allStats = useAtomValue(allYearlyStatsAtom)
  const organizers = useAtomValue(adminOrganizersAtom)
  const [year, setYear] = useState(CURRENT_YEAR)

  const years = allStats.years.includes(CURRENT_YEAR) ? allStats.years : [...allStats.years, CURRENT_YEAR]
  const yearStats = allStats.stats.find((stats) => stats.year === year)

  const organizerNames = useMemo(
    () => new Map(organizers.map((organizer) => [organizer.id, organizer.name])),
    [organizers]
  )

  const { rows, grandTotal } = useMemo(
    () =>
      buildTrialStatsTable(
        yearStats?.trialStats ?? [],
        (organizerId) => organizerNames.get(organizerId) ?? organizerId
      ),
    [organizerNames, yearStats]
  )

  if (!isAdmin) return <Navigate to={Path.admin.index} replace />

  return (
    <Stack spacing={2} sx={{ p: 1, width: '100%' }}>
      <Typography variant="h4">{t('stats.admin.trialStatsTitle')}</Typography>
      <Typography color="text.secondary">{t('stats.admin.trialStatsTitleInfo')}</Typography>

      <Stack alignItems="center" direction="row" flexWrap="wrap" gap={2}>
        <YearSelector years={years} value={year} onChange={setYear} />
        <Button
          disabled={rows.length === 0}
          onClick={() =>
            downloadXlsx({
              fileName: trialStatsFileName(year),
              rows: trialStatsSpreadsheetRows(rows, grandTotal, t),
              sheetName: t('stats.admin.trialStatsTitle'),
            })
          }
          size="small"
          startIcon={<DownloadOutlined />}
          variant="outlined"
        >
          {t('stats.admin.trialStatsExport')}
        </Button>
      </Stack>

      {rows.length === 0 ? (
        <Typography color="text.secondary">{t('stats.noDataForYear')}</Typography>
      ) : (
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('organization')}</TableCell>
              <TableCell>{t('stats.admin.eventType')}</TableCell>
              <TableCell align="right">{t('stats.admin.trialStatsEvents')}</TableCell>
              <TableCell align="right">{t('stats.admin.trialStatsPlaces')}</TableCell>
              <TableCell align="right">{t('stats.admin.trialStatsStarters')}</TableCell>
              <TableCell align="right">{t('stats.admin.trialStatsHandlers')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.organizerId}#${row.eventType}`}>
                <TableCell sx={row.isSubtotal ? { fontWeight: 'bold' } : undefined}>{row.organizerName}</TableCell>
                <TableCell sx={row.isSubtotal ? { fontWeight: 'bold' } : undefined}>
                  {row.isSubtotal ? t('stats.admin.trialStatsTotal') : row.eventType}
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
              </TableRow>
            ))}
          </TableBody>
          {grandTotal ? (
            <TableFooter>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>{t('stats.admin.trialStatsTotal')}</TableCell>
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
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      )}
    </Stack>
  )
}
