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
}

interface Props {
  readonly rows: StartNumberRow[]
  /** The secretary's unsaved entries, keyed by registration id. Empty string clears the field. */
  readonly drafts: Record<string, string>
  readonly disabled?: boolean
  readonly onChange: (id: string, value: string) => void
  /** Two columns instead of four: the number, and the dog with its details under its name (KOE-1282). */
  readonly compact?: boolean
}

const draftOf = (row: StartNumberRow, drafts: Record<string, string>) =>
  drafts[row.id] ?? (row.startNumber != null ? String(row.startNumber) : '')

/**
 * The venue draw's results, written as values (KOE-1218). The same batch-entry shape as results
 * entry: one row per dog, one field, one save. A duplicate is flagged as it is typed — and refused
 * again on the server, where the two-phones case is actually caught.
 */
export function StartNumbersTable({ rows, drafts, disabled, onChange, compact }: Props) {
  const { t } = useTranslation()

  const counts = new Map<string, number>()
  for (const row of rows) {
    const value = draftOf(row, drafts)
    if (value) counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={{ width: 120 }}>{t('startNumbers.column.number')}</TableCell>
            <TableCell>{t('results.column.dog')}</TableCell>
            {!compact && <TableCell>{t('dog.regNo')}</TableCell>}
            {!compact && <TableCell>{t('results.column.handler')}</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => {
            const value = draftOf(row, drafts)
            const duplicate = Boolean(value) && (counts.get(value) ?? 0) > 1

            return (
              <TableRow hover key={row.id}>
                <TableCell>
                  <TextField
                    disabled={disabled}
                    error={duplicate}
                    helperText={duplicate ? t('startNumbers.duplicate') : undefined}
                    inputProps={{ inputMode: 'numeric', pattern: '[0-9]*' }}
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
                    <Typography variant="caption" color="text.secondary" component="div">
                      {[row.dog.regNo, row.handler?.name].filter(Boolean).join(' · ')}
                    </Typography>
                  </TableCell>
                ) : (
                  <>
                    <TableCell>{row.dog.name}</TableCell>
                    <TableCell>{row.dog.regNo}</TableCell>
                    <TableCell>{row.handler?.name}</TableCell>
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
