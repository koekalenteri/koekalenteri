import type { ExerciseSlot } from '@/lib/resultTasks'
import type { NowtZeroFault, PublicJudge } from '@/types'
import type { TaskEdit } from './types'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { formatPoints, parsePoints } from '@/lib/exerciseScoring'
import { nowtZeroFaults, taskEntryCeiling } from '@/lib/results'
import { effectiveJudge, isRecordedTask } from '@/lib/resultTasks'
import { NumberInput } from '../NumberInput'

/**
 * A part's name ("Rasti 2, osa 1/2") needs the room its label takes where the field shows it; a table
 * column has two digits to show and a ceiling beside it, so its field is the narrower.
 */
const scoreFieldWidth = (inline: boolean, showName: boolean, parts: number) => {
  if (showName) return parts > 1 ? 150 : 96
  return inline ? 48 : 64
}

const selectWidth = (inline: boolean) => (inline ? { width: 130 } : { minWidth: 150 })

/**
 * "29,5" and "29.5" alike, rounded down to the step: a trial that scores whole points takes "29,5" as 29,
 * and the server refuses what is off the step anyway (KOE-1736). "29," on the way to "29,5" holds 29, so
 * a score left there is not cleared. Not a number is no points.
 */
const parseOnStep = (step: number) => (typed: string) => {
  const points = parsePoints(typed.trim().replace(/[,.]$/, ''))
  return points === undefined ? Number.NaN : Math.floor(points / step) * step
}

/** One digit after the separator, and only where the trial scores in halves. */
const pointsPattern = (step: number) => (step < 1 ? '[0-9]{1,3}([,.][0-9])?' : '[0-9]{1,3}')

interface ZeroFaultProps {
  readonly value?: NowtZeroFault
  readonly disabled?: boolean
  readonly inline: boolean
  readonly onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

/**
 * The reason is optional: a zero saves without one, so an empty field is no error. The empty option reads
 * "not known" and takes a chosen reason back; no reason known is no code on the task (KOE-1709).
 */
const ZeroFaultField = ({ value, disabled, inline, onChange }: ZeroFaultProps) => {
  const { t } = useTranslation()

  return (
    <TextField
      disabled={disabled}
      label={t('results.zeroFault')}
      onChange={onChange}
      select
      size="small"
      sx={selectWidth(inline)}
      value={value ?? ''}
    >
      <MenuItem value="">{t('results.zeroFaultUnknown')}</MenuItem>
      {nowtZeroFaults.map((item) => (
        <MenuItem key={item} value={item}>
          {t(`results.zeroFaults.${item}`)}
        </MenuItem>
      ))}
    </TextField>
  )
}

interface JudgeFieldProps {
  readonly judges: PublicJudge[]
  readonly value?: PublicJudge
  readonly disabled?: boolean
  readonly inline: boolean
  readonly onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
}

const JudgeField = ({ judges, value, disabled, inline, onChange }: JudgeFieldProps) => {
  const { t } = useTranslation()

  return (
    <TextField
      disabled={disabled}
      label={t('results.judge')}
      onChange={onChange}
      select
      size="small"
      sx={selectWidth(inline)}
      value={value ? String(value.id) : ''}
    >
      {judges.map((candidate) => (
        <MenuItem key={candidate.id} value={String(candidate.id)}>
          {candidate.name}
        </MenuItem>
      ))}
    </TextField>
  )
}

interface Props {
  readonly task: ExerciseSlot
  readonly value?: TaskEdit
  readonly disabled?: boolean
  /** Names the task. Shown as the field's own label where no column header does, as on a phone's
   *  per-dog card; where a header names it, the name still reaches a screen reader as an aria-label. */
  readonly name: string
  /** Whether {@link name} is rendered as a visible label. */
  readonly showName?: boolean
  /**
   * One row of a table: the ceiling sits beside the field, and a lone judge is left to the column header.
   * A zero's reason and a chosen judge stay narrow, so a column never grows past the width it has
   * without them and the table does not scroll sideways.
   */
  readonly inline?: boolean
  /** Who may have judged this task: the post's own judges, or the class's where the post names none. */
  readonly judges: PublicJudge[]
  /** Carried over from the dog before, since a post is usually judged by the same person all day. */
  readonly defaultJudge?: PublicJudge
  readonly onChange: (task: ExerciseSlot, points: number | null, zeroFault?: NowtZeroFault) => void
  readonly onJudgeChange: (task: ExerciseSlot, judge?: PublicJudge) => void
  /**
   * The dog's round ended at an earlier exercise (`endedBefore`), so it never came to this
   * one: it reads "kesk", as the results sheet writes it, instead of asking for points (KOE-1669). A score
   * stored here anyway stays an input, since it counts and may need clearing.
   */
  readonly notReached?: boolean
  /** The step a score moves by (`pointStep`, KOE-1736): the ceiling of a recall is rounded down to it. */
  readonly step?: number
}

export const TaskScore = ({
  task,
  value,
  disabled,
  name,
  showName = false,
  inline = false,
  judges,
  defaultJudge,
  onChange,
  onJudgeChange,
  notReached = false,
  step = 1,
}: Props) => {
  const { t, i18n } = useTranslation()
  const parseInput = useMemo(() => parseOnStep(step), [step])
  const formatValue = useCallback(
    (points?: number) => (points === undefined ? '' : formatPoints(points, i18n.language)),
    [i18n.language]
  )
  // A stored judge stands while it judges at the exercise's post; one from before the exercise moved to
  // another post gives way to the post's own (`effectiveJudge`, KOE-1665).
  const judge = effectiveJudge(value, judges, defaultJudge)
  const points = value?.points ?? null
  const ceiling = taskEntryCeiling({ maxPoints: task.maxPoints, recalled: value?.recalled }, step)
  const ceilingText = `/ ${formatPoints(ceiling, i18n.language)}`
  const width = scoreFieldWidth(inline, showName, task.parts)

  const handlePoints = useCallback(
    (next?: number) => {
      const clamped = next === undefined ? null : Math.max(0, Math.min(ceiling, next))
      // A score that is no longer zero has no fault to explain.
      onChange(task, clamped, clamped === 0 ? value?.zeroFault : undefined)
    },
    [ceiling, onChange, task, value?.zeroFault]
  )

  const handleJudge = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onJudgeChange(
        task,
        judges.find((candidate) => String(candidate.id) === event.target.value)
      ),
    [judges, onJudgeChange, task]
  )

  const handleFault = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange(
        task,
        0,
        nowtZeroFaults.find((fault) => fault === event.target.value)
      ),
    [onChange, task]
  )

  if (notReached && !(value && isRecordedTask(value))) {
    // Where no column header names the task, the text names it.
    const text = t('results.notReached')
    return (
      <Typography sx={{ color: 'text.secondary', minWidth: 64 }} variant="body2">
        {showName ? `${name}: ${text}` : text}
      </Typography>
    )
  }

  const fault = points === 0 && (
    <ZeroFaultField disabled={disabled} inline={inline} onChange={handleFault} value={value?.zeroFault} />
  )

  const judgeSelect = judges.length > 1 && (
    <JudgeField disabled={disabled} inline={inline} judges={judges} onChange={handleJudge} value={judge} />
  )

  const input = (
    <NumberInput
      disabled={disabled}
      formatValue={formatValue}
      inputMode={step < 1 ? 'decimal' : 'numeric'}
      label={showName ? name : undefined}
      onChange={handlePoints}
      parseInput={parseInput}
      pattern={pointsPattern(step)}
      slotProps={showName ? undefined : { input: { inputProps: { 'aria-label': name } } }}
      sx={{ width }}
      value={points ?? undefined}
      // The ceiling belongs on screen: an ALO recall halves it, and the entry is capped either way.
      helperText={inline ? undefined : ceilingText}
    />
  )

  if (inline) {
    return (
      <Stack spacing={0.5} sx={{ alignItems: 'center' }}>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
          {input}
          <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
            {ceilingText}
          </Typography>
        </Stack>
        {judgeSelect}
        {fault}
      </Stack>
    )
  }

  return (
    <Stack
      spacing={0.5}
      sx={{
        alignItems: 'center',
      }}
    >
      {input}
      {/*
          The AC's two shapes. One judge is a fact to state, not a choice to offer; several is a choice,
          and the previous dog's judge is the likely answer because a post is manned all day.
        */}
      {judges.length === 1 && (
        <Typography
          variant="caption"
          sx={{
            color: 'text.secondary',
          }}
        >
          {judges[0].name}
        </Typography>
      )}
      {judgeSelect}
      {fault}
    </Stack>
  )
}
