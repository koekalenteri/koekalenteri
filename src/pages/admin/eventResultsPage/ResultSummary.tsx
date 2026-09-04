import type { RoundTask } from '../../../lib/results'
import type { EventResult, ResultMark } from '../../../types'
import type { ResultEdit } from './types'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import {
  availableResultCodes,
  deriveNowtResult,
  formatEventResult,
  nowtTotals,
  resultMarks,
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
export const ResultSummary = ({ round, edit, stored, eventType, eventClass, disabled, onChange }: Props) => {
  const { t } = useTranslation()
  // What rides beside the result once it is published, shown here so the secretary reads the line the
  // public will read rather than only the choice they made in the outcome control (KOE-1300).
  const marks = <ResultMarks marks={resultMarks(edit)} />

  // A qualitative type has nothing to derive a result from — the judge's decision is the result — so
  // for it this column collects the result rather than displays one. The codes on offer are the type's
  // own: a pass/fail test awards 1 or 0 and no dash, there being nothing to place against.
  if (!scoresAtPosts(eventType)) {
    const codes = availableResultCodes(eventType)

    return (
      <>
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
        {marks}
      </>
    )
  }

  if (!round) {
    return (
      <>
        <Typography
          variant="body2"
          sx={{
            color: 'text.secondary',
          }}
        >
          {stored?.result ?? ''}
        </Typography>
        {marks}
      </>
    )
  }

  const scored = toScoredTasks(round, edit.tasks)
  const code = deriveNowtResult({ elimination: edit.elimination, retirement: edit.retirement, tasks: scored })
  const { points, maxPoints } = nowtTotals(scored)

  return (
    <>
      <Typography
        variant="body2"
        sx={{
          fontWeight: 600,
        }}
      >
        {code ? formatEventResult(code, eventType, eventClass) : '–'}
      </Typography>
      {marks}
      {/* A voided round has no total worth showing beside dogs that ran everything. */}
      {!edit.elimination && !edit.retirement && (
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
          }}
        >
          {t('results.runningTotal', { maxPoints, points })}
        </Typography>
      )}
    </>
  )
}

/** The marks published beside the result — Koiranet's "Lisämerkinnät", and nothing at all when empty. */
const ResultMarks = ({ marks }: { readonly marks: ResultMark[] }) => {
  const { t } = useTranslation()
  if (!marks.length) return null

  return (
    <Typography
      variant="caption"
      sx={{
        color: 'text.secondary',
        display: 'block',
      }}
    >
      {marks.map((mark) => t(`results.marks.${mark}`)).join(' ')}
    </Typography>
  )
}
