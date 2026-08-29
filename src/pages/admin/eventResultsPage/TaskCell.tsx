import type { RoundTask } from '../../../lib/results'
import type { NowtZeroFault, PublicJudge } from '../../../types'
import type { TaskEdit } from './types'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TableCell from '@mui/material/TableCell'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { taskEntryCeiling } from '../../../lib/results'
import { NumberInput } from '../../components/NumberInput'

/** §5.7.3. Codes rather than labels, so a rules rewording cannot orphan recorded history. */
const ZERO_FAULTS: NowtZeroFault[] = [
  'unauthorizedRun',
  'outOfControl',
  'persistentNoise',
  'abandonedRetrieve',
  'refusedWater',
  'dummyNotFound',
  'huntingWithDummy',
  'swappedDummy',
  'eyeWipe',
]

interface Props {
  readonly task: RoundTask
  readonly value?: TaskEdit
  readonly disabled?: boolean
  /** Who may have judged this task: the post's own judges, or the class's where the post names none. */
  readonly judges: PublicJudge[]
  /** Carried over from the dog before, since a post is usually judged by the same person all day. */
  readonly defaultJudge?: PublicJudge
  readonly onChange: (task: RoundTask, points: number | null, zeroFault?: NowtZeroFault) => void
  readonly onJudgeChange: (task: RoundTask, judge?: PublicJudge) => void
}

export const TaskCell = ({ task, value, disabled, judges, defaultJudge, onChange, onJudgeChange }: Props) => {
  const { t } = useTranslation()
  const judge = value?.judge ?? defaultJudge ?? judges[0]
  const points = value?.points ?? null
  const ceiling = taskEntryCeiling({ maxPoints: task.maxPoints, recalled: value?.recalled })

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
    (event: React.ChangeEvent<HTMLInputElement>) => onChange(task, 0, event.target.value as NowtZeroFault),
    [onChange, task]
  )

  return (
    <TableCell align="center">
      <Stack spacing={0.5} alignItems="center">
        <NumberInput
          disabled={disabled}
          onChange={handlePoints}
          sx={{ width: 64 }}
          value={points ?? undefined}
          // The ceiling belongs on screen: an ALO recall halves it, and the entry is capped either way.
          helperText={`/ ${ceiling}`}
        />
        {/*
          The AC's two shapes. One judge is a fact to state, not a choice to offer; several is a choice,
          and the previous dog's judge is the likely answer because a post is manned all day.
        */}
        {judges.length === 1 && (
          <Typography variant="caption" color="text.secondary">
            {judges[0].name}
          </Typography>
        )}
        {judges.length > 1 && (
          <TextField
            disabled={disabled}
            label={t('results.judge')}
            onChange={handleJudge}
            select
            size="small"
            sx={{ minWidth: 150 }}
            value={judge ? String(judge.id) : ''}
          >
            {judges.map((candidate) => (
              <MenuItem key={candidate.id} value={String(candidate.id)}>
                {candidate.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        {points === 0 && (
          <TextField
            disabled={disabled}
            error={!value?.zeroFault}
            // A zero without a reason is the one thing that makes the whole series unanswerable later.
            label={t('results.zeroFault')}
            onChange={handleFault}
            select
            size="small"
            sx={{ minWidth: 150 }}
            value={value?.zeroFault ?? ''}
          >
            {ZERO_FAULTS.map((fault) => (
              <MenuItem key={fault} value={fault}>
                {t(`results.zeroFaults.${fault}`)}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Stack>
    </TableCell>
  )
}
