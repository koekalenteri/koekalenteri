import { useTranslation } from 'react-i18next'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'
import { ConfirmedEvent, Registration } from 'koekalenteri-shared/model'

interface Props {
  event: ConfirmedEvent | null | undefined
  onConfirm: () => void
  onClose: () => void
  open: boolean
  registration: Registration | null | undefined
}

export function ConfirmDialog({ event, onConfirm, onClose, open, registration }: Props) {
  const { t } = useTranslation()

  if (!event || !registration) {
    return null
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      <DialogTitle id="confirm-dialog-title">{t('registration.confirmDialog.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText id="confirm-dialog-description">
          {t('registration.confirmDialog.text', { registration, event })}
        </DialogContentText>
        <DialogContentText id="confirm-dialog-description2" sx={{ py: 1 }}>
          {t('registration.confirmDialog.confirmation')}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onConfirm} autoFocus variant="contained">
          {t('registration.confirmDialog.cta')}
        </Button>
        <Button onClick={onClose} variant="outlined">
          {t('cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
