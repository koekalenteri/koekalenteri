import type { ReactNode } from 'react'
import type { PublicDogEvent, Registration } from '../../types'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import { useTranslation } from 'react-i18next'

interface Props {
  readonly action: ReactNode
  readonly event: PublicDogEvent | null | undefined
  readonly name: 'confirm' | 'payment'
  readonly onClose: () => void
  readonly open: boolean
  readonly pending?: boolean
  readonly registration: Registration | null | undefined
}

export function RegistrationActionDialog({ action, event, name, onClose, open, pending = false, registration }: Props) {
  const { t } = useTranslation()

  if (!event || !registration) {
    return null
  }

  const id = `${name}-dialog`
  const translationKey = `registration.${name}Dialog` as const

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
    >
      <DialogTitle id={`${id}-title`}>{t(`${translationKey}.title`)}</DialogTitle>
      <DialogContent>
        <DialogContentText id={`${id}-description`}>
          {t(`${translationKey}.text`, { event, registration })}
        </DialogContentText>
        <DialogContentText id={`${id}-description2`} sx={{ py: 1 }}>
          {t(`${translationKey}.confirmation`)}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        {action}
        <Button onClick={onClose} variant="outlined" disabled={pending}>
          {t('cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
