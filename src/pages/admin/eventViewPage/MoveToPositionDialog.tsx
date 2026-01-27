import type { Registration } from '../../../types'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
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

interface Props {
  open: boolean
  onClose: () => void
  registration: Registration
  maxPosition: number
  onMove: (position: number) => Promise<void>
}

export default function MoveToPositionDialog({ open, onClose, registration, maxPosition, onMove }: Props) {
  const { t } = useTranslation()
  const [selectedPosition, setSelectedPosition] = useState<number>(registration.group?.number ?? 1)
  const [saving, setSaving] = useState(false)

  const handleMove = async () => {
    setSaving(true)
    try {
      // Subtract 0.5 so the registration is placed BEFORE the selected position
      // e.g., selecting position 2 will place it at 1.5 (between 1 and 2)
      await onMove(selectedPosition - 0.5)
      enqueueSnackbar(t('registration.moveToPositionDialog.moved', { position: selectedPosition }), {
        variant: 'success',
      })
      onClose()
    } catch (error) {
      console.error('Failed to move registration:', error)
      enqueueSnackbar('Virhe siirrossa', { variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  // Generate position options
  const positions = Array.from({ length: maxPosition }, (_, i) => i + 1)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('registration.moveToPositionDialog.title')}</DialogTitle>
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
        <Button onClick={onClose}>{t('close')}</Button>
        <Button onClick={handleMove} variant="contained" disabled={saving}>
          {t('registration.moveToPositionDialog.moveToPosition')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
