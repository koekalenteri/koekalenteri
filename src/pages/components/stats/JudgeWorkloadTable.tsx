import type { JudgeWorkloadEntry } from '@/types/Stats'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { compareByLocalizedString } from '@/lib/client/sort'
import ChartTitle from './ChartTitle'

interface Props {
  readonly data: JudgeWorkloadEntry[]
  readonly filters?: readonly string[]
}

const totalOf = (entry: JudgeWorkloadEntry) => entry.held + entry.upcoming

/**
 * How many events each judge has officiated and is booked for in the selected year, busiest
 * first. A table rather than a chart: the counts are small whole numbers, and with every club
 * selected there are dozens of judges, whose names a chart axis cannot all fit.
 */
export default function JudgeWorkloadTable({ data, filters }: Props) {
  const { t } = useTranslation()
  const title = t('stats.admin.judgeWorkloadTitle')

  const rows = useMemo(() => {
    const byName = compareByLocalizedString('name')
    return [...data].sort((a, b) => totalOf(b) - totalOf(a) || byName(a, b))
  }, [data])

  return (
    <>
      <ChartTitle title={title} info={t('stats.admin.judgeWorkloadTitleInfo')} filters={filters} />
      {rows.length === 0 ? (
        <Typography sx={{ color: 'text.secondary' }}>{t('stats.admin.noJudgeData')}</Typography>
      ) : (
        // The list scrolls within its own height, so it takes focus for the keyboard to scroll it.
        <TableContainer
          aria-label={title}
          component={Paper}
          role="region"
          sx={{ maxHeight: 400, maxWidth: 640 }}
          tabIndex={0}
          variant="outlined"
        >
          <Table size="small" stickyHeader aria-label={title}>
            <TableHead>
              <TableRow>
                <TableCell>{t('judge')}</TableCell>
                <TableCell align="right">{t('stats.admin.judgeHeldEvents')}</TableCell>
                <TableCell align="right">{t('stats.admin.judgeUpcomingEvents')}</TableCell>
                <TableCell align="right">{t('stats.admin.judgeTotalEvents')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {/* Keyed by judgeId: names are not unique, and a judge without an id is keyed by name. */}
              {rows.map((row) => (
                <TableRow key={row.judgeId}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell align="right">{row.held}</TableCell>
                  <TableCell align="right">{row.upcoming}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {totalOf(row)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  )
}
