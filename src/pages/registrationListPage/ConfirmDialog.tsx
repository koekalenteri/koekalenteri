import type { PublicDogEvent, Registration } from '../../types'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import { useTranslation } from 'react-i18next'
import { isConfirmedEvent } from '../../lib/typeGuards'
import { AsyncButton } from '../components/AsyncButton'

interface Props {
  readonly event: PublicDogEvent | null | undefined
  readonly onConfirm: () => Promise<void>
  readonly onClose: () => void
  readonly open: boolean
  readonly pending?: boolean
  readonly registration: Registration | null | undefined
}

export function ConfirmDialog({ event, onConfirm, onClose, open, pending = false, registration }: Props) {
  const { t } = useTranslation()

  if (!event || !registration || !isConfirmedEvent(event)) {
    return null
  }

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-description"
    >
      <DialogTitle id="confirm-dialog-title">{t('registration.confirmDialog.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText id="confirm-dialog-description">
          {t('registration.confirmDialog.text', { event, registration })}
        </DialogContentText>
        <DialogContentText id="confirm-dialog-description2" sx={{ py: 1 }}>
          {t('registration.confirmDialog.confirmation')}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <AsyncButton onClick={onConfirm} autoFocus variant="contained">
          {t('registration.confirmDialog.cta')}
        </AsyncButton>
        <Button onClick={onClose} variant="outlined" disabled={pending}>
          {t('cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
