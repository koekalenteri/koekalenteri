import type { TFunction } from 'i18next'
import type { RegistrationTime } from '@/types'
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
  /**
   * Numbers already gone outside this sheet, each mapped to the class holding it (KOE-1267). A class
   * secretary's link is served one class, so a number another class has drawn looks free here; the
   * event secretary sees the whole trial and needs none of this.
   */
  readonly reserved?: ReadonlyMap<string, string | undefined>
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

/**
 * What is wrong with the number in this field, in the words a field has room for. A number typed
 * twice here is the secretary's own to fix and says so first; one taken elsewhere names where it
 * went, which is the whole point of knowing (KOE-1267).
 */
const conflictText = (
  value: string,
  duplicate: boolean,
  reserved: ReadonlyMap<string, string | undefined> | undefined,
  t: TFunction
): string | undefined => {
  if (duplicate) return t('startNumbers.duplicate')
  if (!value || !reserved?.has(value)) return undefined

  const holder = reserved.get(value)
  return holder ? t('startNumbers.reservedInClass', { eventClass: holder }) : t('startNumbers.reserved')
}

/**
 * "pe 4.9. aamupäivä", the same words the start list's group headers use — or the day alone where
 * the sheet is already headed by its halves.
 */
const placementLabel = (row: StartNumberRow, t: TFunction, withTime: boolean) => {
  const { date, time } = row.placement ?? {}
  if (!date) return ''
  const timeText = withTime && time && time !== 'kp' ? t(`registration.timeLong.${time}`) : ''
  return [t('dateFormat.wdshort', { date }), timeText].filter(Boolean).join(' ')
}

const isHalfDay = (time: RegistrationTime | undefined): time is 'ap' | 'ip' => time === 'ap' || time === 'ip'

/**
 * Whether the sheet holds both a morning and an afternoon. The halves are drawn — and published
 * (KOE-1430) — one at a time, so the secretary entering the morning's numbers has to see where the
 * morning ends: the rows come sorted by time, and a heading marks the turn.
 */
const hasBothHalves = (rows: readonly StartNumberRow[]) =>
  new Set(rows.map((row) => row.placement?.time).filter(isHalfDay)).size > 1

/**
 * The venue draw's results, written as values (KOE-1218). The same batch-entry shape as results
 * entry: one row per dog, one field, one save. A duplicate is flagged as it is typed — and refused
 * again on the server, where the two-phones case is actually caught.
 */
export function StartNumbersTable({ rows, drafts, disabled, onChange, compact, duplicates, reserved }: Props) {
  const { t } = useTranslation()

  const taken = duplicates ?? duplicateNumbers(rows, drafts)
  const byHalf = hasBothHalves(rows)
  const columns = compact ? 2 : 5

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
          {rows.map((row, index) => {
            const value = draftOf(row, drafts)
            const duplicate = Boolean(value) && taken.has(value)
            const conflict = conflictText(value, duplicate, reserved, t)
            const half = row.placement?.time
            const heading = byHalf && isHalfDay(half) && rows[index - 1]?.placement?.time !== half

            return [
              heading ? (
                <TableRow key={`${half}-heading`}>
                  <TableCell colSpan={columns} sx={{ fontWeight: 'bold' }}>
                    {t(`registration.timeLong.${half}`)}
                  </TableCell>
                </TableRow>
              ) : null,
              <TableRow hover key={row.id}>
                <TableCell>
                  <TextField
                    disabled={disabled}
                    error={Boolean(conflict)}
                    helperText={conflict}
                    slotProps={{
                      // The column header names the field on screen; the input carries the same name
                      // for anyone reading a row on its own.
                      htmlInput: {
                        'aria-label': t('startNumbers.column.number'),
                        inputMode: 'numeric',
                        pattern: '[0-9]*',
                      },
                    }}
                    onChange={(event) => onChange(row.id, event.target.value.replace(/\D/g, ''))}
                    placeholder={row.groupNumber != null ? String(row.groupNumber) : undefined}
                    size="small"
                    sx={{
                      // The input is a number wide; what is wrong with it is a sentence, and the
                      // column has the room the input does not — three wrapped lines per flagged row
                      // is most of a screen on a phone (KOE-1267).
                      '& .MuiFormHelperText-root': { whiteSpace: 'nowrap' },
                      width: 96,
                    }}
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
                      {[row.dog.regNo, row.handler?.name, placementLabel(row, t, !byHalf)].filter(Boolean).join(' · ')}
                    </Typography>
                  </TableCell>
                ) : (
                  <>
                    <TableCell>{row.dog.name}</TableCell>
                    <TableCell>{row.dog.regNo}</TableCell>
                    <TableCell>{row.handler?.name}</TableCell>
                    <TableCell>{placementLabel(row, t, !byHalf)}</TableCell>
                  </>
                )}
              </TableRow>,
            ]
          })}
        </TableBody>
      </Table>
    </TableContainer>
  )
}
