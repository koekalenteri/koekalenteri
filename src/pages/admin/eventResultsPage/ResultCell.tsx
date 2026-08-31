import type { RoundTask } from '../../../lib/results'
import type { EventResult } from '../../../types'
import type { ResultEdit } from './types'
import TableCell from '@mui/material/TableCell'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { deriveNowtResult, formatEventResult, nowtTotals, toScoredTasks } from '../../../lib/results'

interface Props {
  readonly round?: RoundTask[]
  readonly edit: ResultEdit
  readonly stored?: EventResult
  readonly eventType: string
  readonly eventClass?: string
}

/**
 * The prize as it stands, recomputed from what is on screen.
 *
 * Derived with the same module the server uses on save, so the number the secretary sees while typing
 * is the one that gets stored. A post's own view passes no round, because the prize depends on posts it
 * cannot see and a partial figure there would be worse than none.
 */
export const ResultCell = ({ round, edit, stored, eventType, eventClass }: Props) => {
  const { t } = useTranslation()

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
