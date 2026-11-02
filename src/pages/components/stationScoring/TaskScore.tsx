import type { ExerciseSlot } from '@/lib/resultTasks'
import type { NowtZeroFault, PublicJudge } from '@/types'
import type { TaskEdit } from './types'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { nowtZeroFaults, taskEntryCeiling } from '@/lib/results'
import { effectiveJudge, isRecordedTask } from '@/lib/resultTasks'
import { NumberInput } from '../NumberInput'

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
   * One row of a table: the ceiling and a zero's reason sit beside the field instead of under it, and a
   * lone judge is left to the column header, so the row keeps one height whatever is entered.
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
}: Props) => {
  const { t } = useTranslation()
  // A stored judge stands while it judges at the exercise's post; one from before the exercise moved to
  // another post gives way to the post's own (`effectiveJudge`, KOE-1665).
  const judge = effectiveJudge(value, judges, defaultJudge)
  const points = value?.points ?? null
  const ceiling = taskEntryCeiling({ maxPoints: task.maxPoints, recalled: value?.recalled })
  // A part's name ("Tehtävä 2, osa 1/2") needs the room its label takes where the field shows it.
  let width = 64
  if (showName) width = task.parts > 1 ? 150 : 96

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
    <TextField
      disabled={disabled}
      error={!value?.zeroFault}
      // A zero without a reason is the one thing that makes the whole series unanswerable later.
      label={t('results.zeroFault')}
      onChange={handleFault}
      select
      size="small"
      sx={{ minWidth: inline ? 120 : 150 }}
      value={value?.zeroFault ?? ''}
    >
      {nowtZeroFaults.map((item) => (
        <MenuItem key={item} value={item}>
          {t(`results.zeroFaults.${item}`)}
        </MenuItem>
      ))}
    </TextField>
  )

  const judgeSelect = judges.length > 1 && (
    <TextField
      disabled={disabled}
      label={t('results.judge')}
      onChange={handleJudge}
      select
      size="small"
      sx={{ minWidth: inline ? 120 : 150 }}
      value={judge ? String(judge.id) : ''}
    >
      {judges.map((candidate) => (
        <MenuItem key={candidate.id} value={String(candidate.id)}>
          {candidate.name}
        </MenuItem>
      ))}
    </TextField>
  )

  const input = (
    <NumberInput
      disabled={disabled}
      label={showName ? name : undefined}
      onChange={handlePoints}
      slotProps={showName ? undefined : { input: { inputProps: { 'aria-label': name } } }}
      sx={{ width }}
      value={points ?? undefined}
      // The ceiling belongs on screen: an ALO recall halves it, and the entry is capped either way.
      helperText={inline ? undefined : `/ ${ceiling}`}
    />
  )

  if (inline) {
    return (
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', justifyContent: 'center' }}>
        {input}
        <Typography variant="caption" sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}>
          {`/ ${ceiling}`}
        </Typography>
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
