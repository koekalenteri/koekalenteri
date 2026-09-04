import type { EliminatingFault, EventStation } from '../../../types'
import type { ResultEdit } from './types'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import ListSubheader from '@mui/material/ListSubheader'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { outcomeReasonEnabled } from '../../../lib/features'
import { eliminatingFaults, STOPPED_RESULT_CODE, scoresAtPosts } from '../../../lib/results'

/**
 * What the control is asking, which narrows with it while the reason list waits on KOE-1299: with only
 * the judge's stop on offer, "hylkäys / keskeytys" would name two things the secretary cannot record.
 *
 * A function rather than three constants because the switch is a module the tests steer.
 */
export const outcomeLabelKeys = () =>
  outcomeReasonEnabled
    ? ({ column: 'results.column.outcome', field: 'results.outcome', notEnded: 'results.outcomeNone' } as const)
    : ({ column: 'results.interruption', field: 'results.interruption', notEnded: 'results.notInterrupted' } as const)

const SCORED = ''
const INJURY = 'injury'
const HANDLER_CHOICE = 'handlerChoice'
const JUDGE_STOPPED = 'judgeStopped'

interface Props {
  readonly value: ResultEdit
  readonly disabled?: boolean
  /** Which rules' hylkäävät virheet to offer. They are not the same list for every event type. */
  readonly eventType?: string
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
 *
 * While `outcomeReasonEnabled` is off the control asks only whether the judge stopped the trial
 * (KOE-1300); the rest of the list waits on KOE-1299 rather than being rebuilt then.
 */
export const RoundOutcome = ({ value, disabled, eventType, stations, stationId, onChange }: Props) => {
  const { t } = useTranslation()
  const labels = outcomeLabelKeys()
  const outcome = outcomeOf(value)
  // A post's own view already knows where it happened; the whole-round view has to ask.
  const where = stationId ?? stationOf(value)
  // A qualitative type collects its result rather than deriving one, so a stop fills its nought in here
  // — the secretary records the stop, not the stop and then the code it is published as. A result
  // already entered stands: rewriting the judge's decision is not this control's to do. Nothing is
  // filled in for a post-scored round, where the code is derived from the scores.
  const stopped = eventType && !scoresAtPosts(eventType) ? STOPPED_RESULT_CODE : undefined
  // Why the round ended, where that is asked at all: each format's own hylkäävät virheet, then the
  // retirements that are not the judge's stop. Built as a list so the one question that is always asked
  // reads as one item in the menu rather than as a gate around every line of it.
  const reasons = outcomeReasonEnabled
    ? [
        <ListSubheader key="eliminated">{t('results.outcomeEliminated')}</ListSubheader>,
        ...eliminatingFaults(eventType).map((fault) => (
          <MenuItem key={fault} value={fault}>
            {t(`results.eliminatingFaults.${fault}`)}
          </MenuItem>
        )),
        <ListSubheader key="retired">{t('results.outcomeRetired')}</ListSubheader>,
        <MenuItem key={INJURY} value={INJURY}>
          {t('results.retirement.injury')}
        </MenuItem>,
        <MenuItem key={HANDLER_CHOICE} value={HANDLER_CHOICE}>
          {t('results.retirement.handlerChoice')}
        </MenuItem>,
      ]
    : []

  const handleOutcome = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value

      const at = where ? { stationId: where } : {}

      // Scores — and a qualitative type's entered result — survive the choice: a dog eliminated at the
      // last post keeps what it earned at the first, and switching back should not have quietly thrown
      // that away.
      const kept = { tasks: value.tasks, ...(value.resultCode ? { resultCode: value.resultCode } : {}) }

      if (next === SCORED) return onChange(kept)
      if (next === INJURY) return onChange({ retirement: { cause: 'injury', ...at }, ...kept })
      if (next === JUDGE_STOPPED) {
        const code = value.resultCode ?? stopped
        return onChange({
          ...kept,
          ...(code ? { resultCode: code } : {}),
          retirement: { cause: 'judgeStopped', ...at },
        })
      }
      if (next === HANDLER_CHOICE) {
        return onChange({ retirement: { cause: 'handlerChoice', ...at }, ...kept })
      }

      return onChange({ elimination: { fault: next as EliminatingFault, ...at }, ...kept })
    },
    [onChange, stopped, value.resultCode, value.tasks, where]
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
        ...(value.resultCode ? { resultCode: value.resultCode } : {}),
      }),
    [onChange, value.resultCode, value.tasks, where]
  )

  return (
    <Stack spacing={0.5}>
      <TextField
        disabled={disabled}
        label={t(labels.field)}
        onChange={handleOutcome}
        select
        size="small"
        sx={{ minWidth: 190 }}
        value={outcome}
      >
        {/* Completing the round is the default, so this reads as the absence of a note rather than an
            outcome of its own — but it stays selectable, since an outcome entered by mistake has to be
            undoable. */}
        <MenuItem value={SCORED}>{t(labels.notEnded)}</MenuItem>
        {reasons}
        <MenuItem value={JUDGE_STOPPED}>{t('results.retirement.judgeStopped')}</MenuItem>
      </TextField>

      {/* A round ends somewhere, and which post is worth keeping rather than losing. */}
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
