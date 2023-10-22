import type { ChangeEvent } from 'react'
import type { Organizer } from '../../../types'

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Save from '@mui/icons-material/Save'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'

interface Props {
  readonly organizer: Organizer | null | undefined
  readonly onClose?: () => void
  readonly onSave?: (organizer: Organizer) => void
  readonly open: boolean
}

export const EditOrganizerDialog = ({ onClose, onSave, open, organizer }: Props) => {
  const { t } = useTranslation()
  const [merchantId, setMerchantId] = useState(organizer?.paytrailMerchantId ?? '')
  const onChange = useCallback((event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setMerchantId(event.target.value)
  }, [])
  const changed = merchantId !== organizer?.paytrailMerchantId

  const handleSave = useCallback(() => {
    if (!organizer) return
    onSave?.({ ...organizer, paytrailMerchantId: merchantId })
  }, [organizer, merchantId, onSave])

  if (!organizer) {
    return null
  }

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      open={open}
      onClose={onClose}
      aria-labelledby="edit-roles-dialog-title"
      aria-describedby="edit-roles-dialog-description"
    >
      <DialogTitle id="edit-roles-dialog-title">{t('organizer.editDialog.title', { organizer })}</DialogTitle>
      <DialogContent>
        <DialogContentText>{t('organizer.paytrailMerchantId')}</DialogContentText>
        <TextField autoFocus fullWidth value={merchantId} onChange={onChange} />
      </DialogContent>
      <DialogActions>
        <Button color="primary" disabled={!changed} startIcon={<Save />} onClick={handleSave} variant="contained">
          Tallenna
        </Button>
        <Button onClick={onClose} variant="outlined">
          Sulje
        </Button>
      </DialogActions>
    </Dialog>
  )
}
