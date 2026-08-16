import type { PublicDogEvent, Registration } from '../../types'
import Button from '@mui/material/Button'
import { useTranslation } from 'react-i18next'
import { RegistrationActionDialog } from './RegistrationActionDialog'

interface Props {
  readonly event: PublicDogEvent | null | undefined
  readonly onConfirm: () => void
  readonly onClose: () => void
  readonly open: boolean
  readonly registration: Registration | null | undefined
}

export const PaymentDialog = ({ event, onConfirm, onClose, open, registration }: Props) => {
  const { t } = useTranslation()

  return (
    <RegistrationActionDialog
      action={
        <Button onClick={onConfirm} autoFocus variant="contained">
          {t('registration.paymentDialog.cta')}
        </Button>
      }
      event={event}
      name="payment"
      open={open}
      onClose={onClose}
      registration={registration}
    />
  )
}
