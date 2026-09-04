import type { TFunction } from 'i18next'
import type { RegistrationTime } from '../../../types'
import Paper from '@mui/material/Paper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'

/** One dog as the number entry needs it — who it is, and where the draw put it. */
export interface StartNumberRow {
  id: string
  dog: { name?: string; regNo?: string }
  handler?: { name?: string }
  /** The frozen, published number, where one exists. */
  startNumber?: number
  /** The working-order number, shown as a hint while nothing is frozen. */
  groupNumber?: number
  /** Where the dog runs: the day and its part, as the start list groups them (KOE-1303). */
  placement?: { date?: Date; time?: RegistrationTime }
}

interface Props {
  readonly rows: StartNumberRow[]
  /** The secretary's unsaved entries, keyed by registration id. Empty string clears the field. */
  readonly drafts: Record<string, string>
  readonly disabled?: boolean
  readonly onChange: (id: string, value: string) => void
  /** Two columns instead of four: the number, and the dog with its details under its name (KOE-1282). */
  readonly compact?: boolean
  /**
   * Numbers held by more than one dog of the class, counted over every day it runs (KOE-1303). When
   * absent the table counts its own rows.
   */
  readonly duplicates?: ReadonlySet<string>
}

const draftOf = (row: StartNumberRow, drafts: Record<string, string>) =>
  drafts[row.id] ?? (row.startNumber != null ? String(row.startNumber) : '')

/** The numbers more than one of these dogs holds, entered or frozen. */
export const duplicateNumbers = (
  rows: ReadonlyArray<Pick<StartNumberRow, 'id' | 'startNumber'>>,
  drafts: Record<string, string>
): Set<string> => {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = drafts[row.id] ?? (row.startNumber != null ? String(row.startNumber) : '')
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([value]) => value))
}

/** "pe 4.9. aamupäivä", the same words the start list's group headers use. */
const placementLabel = (row: StartNumberRow, t: TFunction) => {
  const { date, time } = row.placement ?? {}
  if (!date) return ''
  const timeText = time && time !== 'kp' ? t(`registration.timeLong.${time}`) : ''
  return [t('dateFormat.wdshort', { date }), timeText].filter(Boolean).join(' ')
}

/**
 * The venue draw's results, written as values (KOE-1218). The same batch-entry shape as results
 * entry: one row per dog, one field, one save. A duplicate is flagged as it is typed — and refused
 * again on the server, where the two-phones case is actually caught.
 */
export function StartNumbersTable({ rows, drafts, disabled, onChange, compact, duplicates }: Props) {
  const { t } = useTranslation()

  const taken = duplicates ?? duplicateNumbers(rows, drafts)

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 120 }}>{t('startNumbers.column.number')}</TableCell>
            <TableCell>{t('results.column.dog')}</TableCell>
            {!compact && <TableCell>{t('dog.regNo')}</TableCell>}
            {!compact && <TableCell>{t('results.column.handler')}</TableCell>}
            {!compact && <TableCell>{t('startNumbers.column.day')}</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const value = draftOf(row, drafts)
            const duplicate = Boolean(value) && taken.has(value)

            return (
              <TableRow hover key={row.id}>
                <TableCell>
                  <TextField
                    disabled={disabled}
                    error={duplicate}
                    helperText={duplicate ? t('startNumbers.duplicate') : undefined}
                    slotProps={{ htmlInput: { inputMode: 'numeric', pattern: '[0-9]*' } }}
                    onChange={(event) => onChange(row.id, event.target.value.replace(/\D/g, ''))}
                    placeholder={row.groupNumber != null ? String(row.groupNumber) : undefined}
                    size="small"
                    sx={{ width: 96 }}
                    value={value}
                  />
                </TableCell>
                {compact ? (
                  <TableCell>
                    {row.dog.name}
                    <Typography
                      variant="caption"
                      component="div"
                      sx={{
                        color: 'text.secondary',
                      }}
                    >
                      {[row.dog.regNo, row.handler?.name, placementLabel(row, t)].filter(Boolean).join(' · ')}
                    </Typography>
                  </TableCell>
                ) : (
                  <>
                    <TableCell>{row.dog.name}</TableCell>
                    <TableCell>{row.dog.regNo}</TableCell>
                    <TableCell>{row.handler?.name}</TableCell>
                    <TableCell>{placementLabel(row, t)}</TableCell>
                  </>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
