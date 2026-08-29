import type { RoundTask } from '../../../lib/results'
import type { NowtZeroFault } from '../../../types'
import type { TaskEdit } from './types'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import TableCell from '@mui/material/TableCell'
import TextField from '@mui/material/TextField'
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
  readonly onChange: (task: RoundTask, points: number | null, zeroFault?: NowtZeroFault) => void
}

export const TaskCell = ({ task, value, disabled, onChange }: Props) => {
  const { t } = useTranslation()
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
