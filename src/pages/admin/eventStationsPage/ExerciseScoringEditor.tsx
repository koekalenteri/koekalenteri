import type { DogEvent, ExerciseScoring, Patch } from '@/types'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { exerciseMaxPoints, exerciseScoringErrors, pointStep } from '@/lib/exerciseScoring'
import { NumberInput } from '../../components/NumberInput'

type ExerciseScoringEvent = Pick<DogEvent, 'eventType' | 'exerciseScoring' | 'officialFormat'>

interface Props {
  readonly event: ExerciseScoringEvent
  readonly disabled?: boolean
  /** A saved result or turn keeps the scoring, as PutEvent does (`isOfficialFormatLocked`). */
  readonly locked?: boolean
  readonly onChange?: (patch: Patch<DogEvent>) => void
}

const NOWT_MAX_POINTS = 20

/**
 * The setting as stored: none where it is NOWT's 20 whole points, so a trial set back to the rules reads
 * like one never set (KOE-1736). Otherwise both fields, since the page merges a patch into the draft
 * key by key and a field left out would keep its old value.
 */
const storedScoring = (maxPoints: number, halfPoints: boolean): ExerciseScoring | null =>
  maxPoints === NOWT_MAX_POINTS && !halfPoints ? null : { halfPoints, maxPoints }

/**
 * An exercise's maximum and half points, for an unofficial trial that follows NOWT (KOE-1736). The
 * caller shows it only for such a trial (`hasOwnExerciseScoring`); the event save checks the same rule.
 */
export const ExerciseScoringEditor = ({ event, disabled, locked = false, onChange }: Props) => {
  const { t } = useTranslation()
  const maxPoints = exerciseMaxPoints(event)
  const halfPoints = pointStep(event) < 1
  const error = exerciseScoringErrors(event)[0]?.kind
  const fieldsDisabled = disabled || locked

  const setScoring = (nextMax: number, nextHalves: boolean) =>
    onChange?.({ exerciseScoring: storedScoring(nextMax, nextHalves) })

  let helperText = t('event.exerciseScoringInfo')
  if (locked) helperText = t('event.exerciseScoringLocked')
  else if (error === 'badMaxPoints') helperText = t('event.exerciseScoringBadMax')
  else if (error === 'oddWithoutHalves') helperText = t('event.exerciseScoringOddWithoutHalves')

  return (
    <Stack spacing={0.5} sx={{ width: '100%' }}>
      <Typography component="h2" variant="subtitle2">
        {t('event.exerciseScoringTitle')}
      </Typography>
      <Stack direction="row" spacing={2} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <NumberInput
          disabled={fieldsDisabled}
          error={!!error}
          label={t('event.exerciseMaxPoints')}
          // An emptied field is the rules' 20.
          onChange={(value) => setScoring(value ?? NOWT_MAX_POINTS, halfPoints)}
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ width: 200 }}
          value={maxPoints}
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={halfPoints}
              disabled={fieldsDisabled}
              onChange={(_, checked) => setScoring(maxPoints, checked)}
            />
          }
          label={t('event.exerciseHalfPoints')}
        />
      </Stack>
      <FormHelperText error={!locked && !!error}>{helperText}</FormHelperText>
    </Stack>
  )
}
