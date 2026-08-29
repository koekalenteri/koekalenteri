import type { EventResult, Registration } from '../../../types'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'

export interface ResultConflict {
  id: string
  stationId?: string
  stored: EventResult
  submitted: EventResult
}

/** Which version the secretary decided to keep, per dog. */
export type ConflictChoice = 'stored' | 'mine'

interface Props {
  readonly conflicts: ResultConflict[]
  readonly registrations: Registration[]
  readonly choices: Record<string, ConflictChoice>
  readonly onChoose: (id: string, choice: ConflictChoice) => void
  readonly onResolve: () => Promise<void>
  readonly onClose: () => void
}

const describe = (result: EventResult) =>
  [result.result, result.points === undefined ? undefined : `${result.points} p`].filter(Boolean).join(' · ')

/**
 * Both versions, side by side, for a person to choose between.
 *
 * The server cannot pick: the two disagree about what the dog did, and only someone who was there
 * knows which is right. Keeping the work on screen until that choice is made is the point — a conflict
 * that simply failed the save would throw away everything the secretary had entered.
 */
export const ConflictDialog = ({ conflicts, registrations, choices, onChoose, onResolve, onClose }: Props) => {
  const { t } = useTranslation()
  const nameOf = (id: string) => registrations.find((reg) => reg.id === id)?.dog?.name ?? id

  return (
    <Dialog fullWidth maxWidth="sm" onClose={onClose} open={conflicts.length > 0}>
      <DialogTitle>{t('results.conflictTitle')}</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>{t('results.conflictInfo')}</DialogContentText>
        <Stack spacing={2}>
          {conflicts.map((conflict) => (
            <Stack key={conflict.id} spacing={0.5}>
              <Typography fontWeight={600}>{nameOf(conflict.id)}</Typography>
              <RadioGroup
                onChange={(_event, value) => onChoose(conflict.id, value as ConflictChoice)}
                value={choices[conflict.id] ?? 'stored'}
              >
                <FormControlLabel
                  control={<Radio size="small" />}
                  label={t('results.conflictStored', {
                    result: describe(conflict.stored),
                    who: conflict.stored.updatedBy,
                  })}
                  value="stored"
                />
                <FormControlLabel
                  control={<Radio size="small" />}
                  label={t('results.conflictMine', { result: describe(conflict.submitted) })}
                  value="mine"
                />
              </RadioGroup>
            </Stack>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button onClick={onResolve} variant="contained">
          {t('results.conflictResolve')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
