import type { RoundTask } from '../../../lib/results'
import type { EventResult } from '../../../types'
import type { ResultEdit } from './types'
import MenuItem from '@mui/material/MenuItem'
import TableCell from '@mui/material/TableCell'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import {
  availableResultCodes,
  deriveNowtResult,
  formatEventResult,
  nowtTotals,
  scoresAtPosts,
  toScoredTasks,
} from '../../../lib/results'

interface Props {
  readonly round?: RoundTask[]
  readonly edit: ResultEdit
  readonly stored?: EventResult
  readonly eventType: string
  readonly eventClass?: string
  readonly disabled?: boolean
  readonly onChange: (edit: ResultEdit) => void
}

/**
 * The prize as it stands, recomputed from what is on screen.
 *
 * Derived with the same module the server uses on save, so the number the secretary sees while typing
 * is the one that gets stored. A post's own view passes no round, because the prize depends on posts it
 * cannot see and a partial figure there would be worse than none.
 */
export const ResultCell = ({ round, edit, stored, eventType, eventClass, disabled, onChange }: Props) => {
  const { t } = useTranslation()

  // A qualitative type has nothing to derive a result from — the judge's decision is the result — so
  // for it this column collects the result rather than displays one. The codes on offer are the type's
  // own: a pass/fail test awards 1 or 0 and no dash, there being nothing to place against.
  if (!scoresAtPosts(eventType)) {
    const codes = availableResultCodes(eventType)

    return (
      <TableCell align="right">
        <TextField
          disabled={disabled}
          label={t('results.column.result')}
          onChange={(event) => onChange({ ...edit, resultCode: codes.find((code) => code === event.target.value) })}
          select
          size="small"
          sx={{ minWidth: 110 }}
          value={edit.resultCode ?? ''}
        >
          <MenuItem value="">{t('results.resultNone')}</MenuItem>
          {codes.map((code) => (
            <MenuItem key={code} value={code}>
              {formatEventResult(code, eventType, eventClass)}
            </MenuItem>
          ))}
        </TextField>
      </TableCell>
    )
  }

  if (!round) {
    return (
      <TableCell align="right">
        <Typography variant="body2" color="text.secondary">
          {stored?.result ?? ''}
        </Typography>
      </TableCell>
    )
  }

  const scored = toScoredTasks(round, edit.tasks)
  const code = deriveNowtResult({ elimination: edit.elimination, retirement: edit.retirement, tasks: scored })
  const { points, maxPoints } = nowtTotals(scored)

  return (
    <TableCell align="right">
      <Typography variant="body2" fontWeight={600}>
        {code ? formatEventResult(code, eventType, eventClass) : '–'}
      </Typography>
      {/* A voided round has no total worth showing beside dogs that ran everything. */}
      {!edit.elimination && !edit.retirement && (
        <Typography variant="caption" color="text.secondary">
          {t('results.runningTotal', { maxPoints, points })}
        </Typography>
      )}
    </TableCell>
  )
}
