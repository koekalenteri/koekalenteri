import type { EventStation, NowtEliminatingFault } from '../../../types'
import type { ResultEdit } from './types'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import ListSubheader from '@mui/material/ListSubheader'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TableCell from '@mui/material/TableCell'
import TextField from '@mui/material/TextField'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'

/** §5.7.2. Every one of these voids the round and is recorded as a dash, never a zero. */
const ELIMINATING_FAULTS: NowtEliminatingFault[] = [
  'aggression',
  'gunShyness',
  'refusedRetrieve',
  'hardMouth',
  'harshHandling',
]

const SCORED = ''
const INJURY = 'injury'
const HANDLER_CHOICE = 'handlerChoice'

interface Props {
  readonly value: ResultEdit
  readonly disabled?: boolean
  /** The posts a round could have ended at. Empty for event types that are not scored at posts. */
  readonly stations: EventStation[]
  /** Set in a post's own view: the round can only have ended at the post being scored. */
  readonly stationId?: string
  readonly onChange: (edit: ResultEdit) => void
}

const outcomeOf = (edit: ResultEdit) => edit.elimination?.fault ?? edit.retirement?.cause ?? SCORED
const stationOf = (edit: ResultEdit) => edit.elimination?.stationId ?? edit.retirement?.stationId ?? ''

/**
 * How the round ended, where that is something other than being scored.
 *
 * Elimination and withdrawal sit in one control because they answer the same question — the dog did not
 * finish — even though the rules treat them differently: every elimination is a dash, while a handler's
 * own withdrawal is a dash only if the judge holds the dog could still have placed.
 */
export const RoundOutcome = ({ value, disabled, stations, stationId, onChange }: Props) => {
  const { t } = useTranslation()
  const outcome = outcomeOf(value)
  // A post's own view already knows where it happened; the whole-round view has to ask.
  const where = stationId ?? stationOf(value)

  const handleOutcome = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value

      const at = where ? { stationId: where } : {}

      // Scores survive the choice: a dog eliminated at the last post keeps what it earned at the first,
      // and switching back should not have quietly thrown that away.
      if (next === SCORED) return onChange({ tasks: value.tasks })
      if (next === INJURY) return onChange({ retirement: { cause: 'injury', ...at }, tasks: value.tasks })
      if (next === HANDLER_CHOICE) {
        return onChange({ retirement: { cause: 'handlerChoice', ...at }, tasks: value.tasks })
      }

      return onChange({ elimination: { fault: next as NowtEliminatingFault, ...at }, tasks: value.tasks })
    },
    [onChange, value.tasks, where]
  )

  const handleWhere = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value || undefined

      if (value.elimination) return onChange({ ...value, elimination: { ...value.elimination, stationId: next } })
      if (value.retirement) return onChange({ ...value, retirement: { ...value.retirement, stationId: next } })
    },
    [onChange, value]
  )

  const handleContention = useCallback(
    (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) =>
      onChange({
        retirement: { cause: 'handlerChoice', couldStillHavePlaced: checked, ...(where ? { stationId: where } : {}) },
        tasks: value.tasks,
      }),
    [onChange, value.tasks, where]
  )

  return (
    <Stack spacing={0.5}>
      <TextField
        disabled={disabled}
        label={t('results.outcome')}
        onChange={handleOutcome}
        select
        size="small"
        sx={{ minWidth: 190 }}
        value={outcome}
      >
        {/* Completing the round is the default, so this reads as the absence of a note rather than an
            outcome of its own — but it stays selectable, since an elimination entered by mistake has to
            be undoable. */}
        <MenuItem value={SCORED}>{t('results.outcomeNone')}</MenuItem>
        <ListSubheader>{t('results.outcomeEliminated')}</ListSubheader>
        {ELIMINATING_FAULTS.map((fault) => (
          <MenuItem key={fault} value={fault}>
            {t(`results.eliminatingFaults.${fault}`)}
          </MenuItem>
        ))}
        <ListSubheader>{t('results.outcomeRetired')}</ListSubheader>
        <MenuItem value={INJURY}>{t('results.retirement.injury')}</MenuItem>
        <MenuItem value={HANDLER_CHOICE}>{t('results.retirement.handlerChoice')}</MenuItem>
      </TextField>

      {/* An elimination happens somewhere, and which post is worth keeping rather than losing. */}
      {outcome !== SCORED && stations.length > 0 && !stationId && (
        <TextField
          disabled={disabled}
          label={t('results.outcomeAt')}
          onChange={handleWhere}
          select
          size="small"
          sx={{ minWidth: 190 }}
          value={where}
        >
          <MenuItem value="">{t('results.outcomeAtUnknown')}</MenuItem>
          {stations.map((station) => (
            <MenuItem key={station.id} value={station.id}>
              {t('event.station')} {station.number}
            </MenuItem>
          ))}
        </TextField>
      )}

      {/* §5.8.1 asks this only of a handler's own withdrawal; an injured dog always takes the dash. */}
      {outcome === HANDLER_CHOICE && (
        <FormControlLabel
          control={
            <Checkbox
              checked={Boolean(value.retirement?.couldStillHavePlaced)}
              disabled={disabled}
              onChange={handleContention}
              size="small"
            />
          }
          label={t('results.couldStillHavePlaced')}
        />
      )}
    </Stack>
  )
}

/** The same control in a table row. */
export const RoundOutcomeCell = (props: Props) => (
  <TableCell>
    <RoundOutcome {...props} />
  </TableCell>
)
