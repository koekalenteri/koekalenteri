import type { Registration } from '../../../types'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'
import { enqueueSnackbar } from 'notistack'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorSnackbarOptions } from '../../../lib/client/snackbar'

interface Props {
  open: boolean
  onClose: () => void
  registration: Registration
  onSave: (internalNotes: string) => Promise<void>
}

/**
 * Editing a secretary's note as an action of its own, from the registration's menu.
 *
 * The same note is also editable on the registration form, but reaching it there means opening the
 * whole registration; this is the quick way in from the list. Unlike the form section, a dialog
 * asks to be committed, so the note saves on the button rather than as it is typed.
 */
export default function InternalNotesDialog({ open, onClose, registration, onSave }: Readonly<Props>) {
  const { t } = useTranslation()
  const stored = registration.internalNotes ?? ''
  const [internalNotes, setInternalNotes] = useState(stored)
  const [saving, setSaving] = useState(false)

  // start from what is stored each time the dialog opens, dropping any abandoned edit
  useEffect(() => {
    if (open) setInternalNotes(stored)
  }, [open, stored])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(internalNotes)
      onClose()
    } catch (error) {
      console.error('Failed to save internal notes:', error)
      enqueueSnackbar(t('registration.internalNotesDialog.saveFailed'), errorSnackbarOptions)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{t('registration.internalNotesDialog.title', { name: registration.dog.name })}</DialogTitle>
      <DialogContent>
        <TextField
          autoFocus
          disabled={saving}
          label={t('registration.internalNotes')}
          multiline
          name="internalNotes"
          onChange={(e) => setInternalNotes(e.target.value)}
          rows={4}
          sx={{ mt: 2, width: '100%' }}
          value={internalNotes}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button onClick={handleSave} variant="contained" disabled={saving}>
          {t('save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
