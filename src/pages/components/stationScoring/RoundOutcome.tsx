import type { TextFieldProps } from '@mui/material/TextField'
import type { ExerciseSlot } from '@/lib/resultTasks'
import type { EliminatingFault, EventStation } from '@/types'
import type { ResultEdit } from './types'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import ListSubheader from '@mui/material/ListSubheader'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { outcomeReasonEnabled } from '@/lib/features'
import { scoresAtPosts } from '@/lib/liveFormat'
import { canBeStopped, eliminatingFaults, hasJudgeStop, STOPPED_RESULT_CODE } from '@/lib/results'
import { endedAtExercise, exercisePostsOf } from '@/lib/resultTasks'

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

/**
 * Whether the control has anything to ask: the reasons a round ended, where those are switched on, or
 * the judge's stop, where the format has one (`hasJudgeStop`) or the dog's stored result already carries
 * one. NOU has no stop, so with the reasons switched off a taipumuskoe has no outcome to record and no
 * column for it (KOE-1643). A stop stored before that keeps the question, so the secretary can take it
 * away.
 */
export const asksOutcome = (eventType: string | undefined, carriesStop = false): boolean =>
  outcomeReasonEnabled || hasJudgeStop(eventType) || carriesStop

const SCORED = ''
const HANDLER_CHOICE = 'handlerChoice'
const JUDGE_STOPPED = 'judgeStopped'

/** The ways a round ends that the judge does not decide on the dog's work, in the order the menu offers them. */
const RETIREMENTS = ['handlerChoice', 'injury', 'illness'] as const
type Retirement = (typeof RETIREMENTS)[number]
const retirementOf = (value: string): Retirement | undefined => RETIREMENTS.find((cause) => cause === value)

/** A table cell is as wide as its fields, so a long label wraps instead of widening the column. */
const TABLE_CELL_WIDTH = { width: 160 }

/** The column header names a control nothing has been chosen in, so it shrinks to a dash. */
const idleSelectProps = (name: string): TextFieldProps['slotProps'] => ({
  // A screen reader still gets the name the visible label would have given.
  htmlInput: { 'aria-label': name },
  select: {
    displayEmpty: true,
    MenuProps: { slotProps: { paper: { sx: { minWidth: 240 } } } },
    renderValue: () => '–',
  },
})

const outcomeFieldSx = (idle: boolean) => (idle ? { minWidth: 0, width: 72 } : { minWidth: 190 })

interface Props {
  readonly value: ResultEdit
  readonly disabled?: boolean
  /** Which rules' hylkäävät virheet to offer. They are not the same list for every event type. */
  readonly eventType?: string
  /** The day's posts, which name the places on offer. */
  readonly stations: EventStation[]
  /** Set in a post's own view: the round can only have ended at the post being scored. */
  readonly stationId?: string
  /**
   * Where a round scored by exercise may have ended (KOE-1665): the exercises of the dog's running order,
   * those at the post on view where there is one. A post may come more than once, so the place is an
   * exercise, stored with its post. Absent for the formats that are not scored by exercise.
   */
  readonly places?: readonly Place[]
  /** The stored result carries a judge's stop, which stays clearable where the format has none. */
  readonly carriesStop?: boolean
  readonly onChange: (edit: ResultEdit) => void
  /**
   * A table cell: a round that was simply scored is the rule and an outcome the exception, so until one
   * is picked the control is a narrow dash under its column header rather than a field of its own.
   */
  readonly inline?: boolean
}

/** An exercise of the dog's running order and the post it is done at. */
type Place = Pick<ExerciseSlot, 'exercise' | 'stationId'>

const outcomeOf = (edit: ResultEdit) => edit.elimination?.fault ?? edit.retirement?.cause ?? SCORED
const stationOf = (edit: ResultEdit) => edit.elimination?.stationId ?? edit.retirement?.stationId ?? ''

/**
 * How the round ended, where that is something other than being scored.
 *
 * Elimination and withdrawal sit in one control because they answer the same question, that the dog did
 * not finish, even though the rules treat them differently: in a working test an elimination is the
 * nought (§5.4.1), while a handler's own withdrawal is a dash if the judge holds the dog could still have
 * placed.
 *
 * While `outcomeReasonEnabled` is off, a round scored at posts (NOWT) offers the retirements and the
 * judge's stop (KOE-1669), and the other formats the judge's stop alone (KOE-1300); the hylkäävät virheet
 * wait on KOE-1299 rather than being rebuilt then.
 */
export const RoundOutcome = ({
  value,
  disabled,
  eventType,
  stations,
  stationId,
  places,
  carriesStop = false,
  inline = false,
  onChange,
}: Props) => {
  const { t } = useTranslation()
  const labels = outcomeLabelKeys()
  const outcome = outcomeOf(value)
  // A post's own view already knows where it happened; the whole-round view has to ask.
  const where = stationId ?? stationOf(value)
  // Where the round is scored by exercise, the place is an exercise: the only one on view, or the one the
  // stored outcome names, a stop stored with its post alone read as the last exercise there.
  const fixedPlace = stationId && places?.length === 1 ? places[0] : undefined
  const namedExercise = places
    ? endedAtExercise(value.retirement ?? value.elimination, exercisePostsOf(places))
    : undefined
  const place = fixedPlace ?? places?.find((item) => item.exercise === namedExercise)
  // Where the outcome is stored: the exercise where the round is scored by exercise, which like a score
  // stays with its number whatever the posts become (KOE-1665), the post for a type judged as a whole,
  // or nowhere ("Ei tiedossa").
  const at = useMemo(() => {
    if (places) return place ? { exercise: place.exercise } : {}
    return where ? { stationId: where } : {}
  }, [place, places, where])
  // A qualitative type collects its result rather than deriving one, so a stop fills its nought in here
  // — the secretary records the stop, not the stop and then the code it is published as. Nothing is
  // filled in for a post-scored round, where the code is derived from the scores.
  const stopped = eventType && !scoresAtPosts(eventType) ? STOPPED_RESULT_CODE : undefined
  // A prize already entered cannot take a stop beside it (`canBeStopped`): a `1` with "Kesk." under it
  // would say two things at once, which is what Minsu found the screen allowing. Picking the nought, or
  // clearing the result, opens the choice again — and picking a prize over a recorded stop takes the
  // stop away (`withResultCode`), so the control is never greyed out while showing one.
  const stopLocked = stopped !== undefined && !canBeStopped(value.resultCode)
  const offersStop = hasJudgeStop(eventType) || carriesStop
  // Why the round ended, where that is asked at all: each format's own hylkäävät virheet, where they are
  // switched on, then the retirements that are not the judge's stop. A round scored at posts asks for
  // those in any case, since its result is derived from them (KOE-1669). Built as a list so the one
  // question that is always asked reads as one item in the menu rather than as a gate around every line.
  const retirements =
    outcomeReasonEnabled || scoresAtPosts(eventType)
      ? RETIREMENTS.map((cause) => (
          <MenuItem key={cause} value={cause}>
            {t(`results.retirement.${cause}`)}
          </MenuItem>
        ))
      : []
  const reasons = outcomeReasonEnabled
    ? [
        <ListSubheader key="eliminated">{t('results.outcomeEliminated')}</ListSubheader>,
        ...eliminatingFaults(eventType).map((fault) => (
          <MenuItem key={fault} value={fault}>
            {t(`results.eliminatingFaults.${fault}`)}
          </MenuItem>
        )),
        <ListSubheader key="retired">{t('results.outcomeRetired')}</ListSubheader>,
        ...retirements,
      ]
    : retirements

  const idle = inline && outcome === SCORED

  const handleOutcome = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value

      // Scores — and a qualitative type's entered result — survive the choice: a dog eliminated at the
      // last post keeps what it earned at the first, and switching back should not have quietly thrown
      // that away.
      const kept = { tasks: value.tasks, ...(value.resultCode ? { resultCode: value.resultCode } : {}) }

      if (next === SCORED) return onChange(kept)
      if (next === JUDGE_STOPPED) {
        return onChange({
          ...kept,
          ...(stopped ? { resultCode: stopped } : {}),
          retirement: { cause: 'judgeStopped', ...at },
        })
      }
      const retirement = retirementOf(next)
      if (retirement) return onChange({ retirement: { cause: retirement, ...at }, ...kept })

      return onChange({ elimination: { fault: next as EliminatingFault, ...at }, ...kept })
    },
    [at, onChange, stopped, value.resultCode, value.tasks]
  )

  const handleWhere = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = places?.find((item) => String(item.exercise) === event.target.value)
      const placed = picked ? { exercise: picked.exercise } : {}

      if (value.elimination) {
        const { exercise: _exercise, stationId: _stationId, ...elimination } = value.elimination
        return onChange({ ...value, elimination: { ...elimination, ...placed } })
      }
      if (value.retirement) {
        const { exercise: _exercise, stationId: _stationId, ...retirement } = value.retirement
        return onChange({ ...value, retirement: { ...retirement, ...placed } })
      }
    },
    [onChange, places, value]
  )

  const handleContention = useCallback(
    (_event: React.ChangeEvent<HTMLInputElement>, checked: boolean) =>
      onChange({
        retirement: { cause: 'handlerChoice', couldStillHavePlaced: checked, ...at },
        tasks: value.tasks,
        ...(value.resultCode ? { resultCode: value.resultCode } : {}),
      }),
    [at, onChange, value.resultCode, value.tasks]
  )

  if (!asksOutcome(eventType, carriesStop)) return null

  return (
    <Stack spacing={0.5} sx={inline && !idle ? TABLE_CELL_WIDTH : undefined}>
      {/* With the stop the only thing on offer, a locked stop is a locked control; with the reasons of
          KOE-1299 beside it, only the stop's own line goes grey. */}
      <TextField
        disabled={disabled || (stopLocked && reasons.length === 0)}
        label={idle ? undefined : t(labels.field)}
        onChange={handleOutcome}
        select
        size="small"
        slotProps={idle ? idleSelectProps(t(labels.field)) : undefined}
        sx={outcomeFieldSx(idle)}
        value={outcome}
      >
        {/* Completing the round is the default, so this reads as the absence of a note rather than an
            outcome of its own — but it stays selectable, since an outcome entered by mistake has to be
            undoable. */}
        <MenuItem value={SCORED}>{t(labels.notEnded)}</MenuItem>
        {reasons}
        {offersStop && (
          <MenuItem disabled={stopLocked} value={JUDGE_STOPPED}>
            {t('results.retirement.judgeStopped')}
          </MenuItem>
        )}
      </TextField>

      {/* A round ends somewhere, and which post is worth keeping rather than losing. */}
      {outcome !== SCORED && places && places.length > 0 && !fixedPlace && (
        <TextField
          disabled={disabled}
          label={t('results.outcomeAt')}
          onChange={handleWhere}
          select
          size="small"
          sx={{ minWidth: 190 }}
          value={place ? String(place.exercise) : ''}
        >
          <MenuItem value="">{t('results.outcomeAtUnknown')}</MenuItem>
          {places.map((item) => (
            <MenuItem key={item.exercise} value={String(item.exercise)}>
              {t('results.outcomeAtExercise', {
                exercise: item.exercise,
                number: stations.find((station) => station.id === item.stationId)?.number ?? '',
              })}
            </MenuItem>
          ))}
        </TextField>
      )}

      {/* §5.4.1 asks this only of a handler's own withdrawal; an injured or ill dog always takes the dash. */}
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
