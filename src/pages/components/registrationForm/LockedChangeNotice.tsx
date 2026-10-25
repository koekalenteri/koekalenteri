import type { ParticipantLockReason, ParticipantLockSection } from '@/lib/registrationLocks'
import Alert from '@mui/material/Alert'
import { useTranslation } from 'react-i18next'

interface Props {
  readonly onClose?: () => void
  readonly reason: ParticipantLockReason
  readonly section: ParticipantLockSection
}

/**
 * Tells the participant why the form put a change back: the section closed with the payment, the place
 * in the trial or the close of entry, and only the secretary changes it now (KOE-1588).
 */
export function LockedChangeNotice({ onClose, reason, section }: Props) {
  const { t } = useTranslation()

  return (
    <Alert severity="info" onClose={onClose} sx={{ m: 1 }}>
      {t('registration.lockedChange', {
        reason: t(`registration.lockedReason.${reason}`),
        section: t(`registration.lockedSection.${section}`),
      })}
    </Alert>
  )
}
