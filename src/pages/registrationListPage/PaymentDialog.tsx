import type { PublicDogEvent, Registration } from '../../types'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import { useTranslation } from 'react-i18next'

interface Props {
  readonly event: PublicDogEvent | null | undefined
  readonly onConfirm: () => void
  readonly onClose: () => void
  readonly open: boolean
  readonly registration: Registration | null | undefined
}

export const PaymentDialog = ({ event, onConfirm, onClose, open, registration }: Props) => {
  const { t } = useTranslation()

  if (!event || !registration) {
    return null
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="payment-dialog-title"
      aria-describedby="payment-dialog-description"
    >
      <DialogTitle id="payment-dialog-title">{t('registration.paymentDialog.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText id="payment-dialog-description">
          {t('registration.paymentDialog.text', { event, registration })}
        </DialogContentText>
        <DialogContentText id="payment-dialog-description2" sx={{ py: 1 }}>
          {t('registration.paymentDialog.confirmation')}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onConfirm} autoFocus variant="contained">
          {t('registration.paymentDialog.cta')}
        </Button>
        <Button onClick={onClose} variant="outlined">
          {t('cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
