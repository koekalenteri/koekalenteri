import type { PublicDogEvent, Registration } from '../../types'
import { useTranslation } from 'react-i18next'
import { isConfirmedEvent } from '../../lib/typeGuards'
import { AsyncButton } from '../components/AsyncButton'
import { RegistrationActionDialog } from './RegistrationActionDialog'

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
    <RegistrationActionDialog
      action={
        <AsyncButton onClick={onConfirm} autoFocus variant="contained">
          {t('registration.confirmDialog.cta')}
        </AsyncButton>
      }
      event={event}
      name="confirm"
      open={open}
      onClose={onClose}
      pending={pending}
      registration={registration}
    />
  )
}
