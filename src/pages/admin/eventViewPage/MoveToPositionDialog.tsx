import type { Registration } from '../../../types'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import InputLabel from '@mui/material/InputLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import { enqueueSnackbar } from 'notistack'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorSnackbarOptions } from '../../../lib/client/snackbar'
import { isParticipantGroup } from '../../../lib/registration'

interface Props {
  open: boolean
  onClose: () => void
  registration: Registration
  positions: number[]
  /**
   * The day's draw has begun (KOE-1273): the chosen place is entered as the dog's own start number,
   * so it is passed on as-is instead of the working-order insertion anchor.
   */
  assignNumber?: boolean
  onMove: (position: number) => Promise<void>
}

export default function MoveToPositionDialog({
  open,
  onClose,
  registration,
  positions,
  assignNumber,
  onMove,
}: Readonly<Props>) {
  const { t } = useTranslation()
  const [selectedPosition, setSelectedPosition] = useState<number>(
    registration.startGroup?.number ?? registration.group?.number ?? 1
  )
  const [saving, setSaving] = useState(false)

  const handleMove = async () => {
    setSaving(true)
    try {
      const isParticipantMove = isParticipantGroup(registration.group?.key)
      const currentPosition = registration.group?.number
      let movePosition = selectedPosition
      if (!assignNumber) {
        movePosition =
          isParticipantMove && typeof currentPosition === 'number' && currentPosition < selectedPosition
            ? selectedPosition + 0.5
            : selectedPosition - 0.5
      }
      await onMove(movePosition)
      enqueueSnackbar(
        t('registration.moveToPositionDialog.moved', { name: registration.dog.name, position: selectedPosition }),
        {
          variant: 'success',
        }
      )
      onClose()
    } catch (error) {
      console.error('Failed to move registration:', error)
      enqueueSnackbar('Virhe siirrossa', errorSnackbarOptions)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('registration.moveToPositionDialog.title', { name: registration.dog.name })}</DialogTitle>
      <DialogContent>
        <FormControl fullWidth sx={{ mt: 2 }}>
          <InputLabel id="position-select-label">{t('registration.moveToPositionDialog.selectPosition')}</InputLabel>
          <Select
            labelId="position-select-label"
            value={selectedPosition}
            label={t('registration.moveToPositionDialog.selectPosition')}
            onChange={(e) => setSelectedPosition(Number(e.target.value))}
          >
            {positions.map((position) => (
              <MenuItem key={position} value={position}>
                {position}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleMove} variant="contained" disabled={saving}>
          {t('registration.moveToPositionDialog.moveToPosition')}
        </Button>
        <Button onClick={onClose} variant="outlined">
          {t('close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
