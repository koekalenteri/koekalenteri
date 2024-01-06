import type { TFunction } from 'i18next'
import type { PublicConfirmedEvent, Registration } from '../../types'

import { Trans } from 'react-i18next'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import Link from '@mui/material/Link'

interface Props {
  readonly disabled?: boolean
  readonly event: PublicConfirmedEvent | null | undefined
  readonly onCancel?: () => void
  readonly onClose?: () => void
  readonly open: boolean
  readonly registration: Registration | null | undefined
  readonly t: TFunction
}

export function CancelDialog({ disabled, event, onCancel, onClose, open, registration, t }: Props) {
  if (!event || !registration) {
    return null
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="cancel-dialog-title"
      aria-describedby="cancel-dialog-description"
    >
      <DialogTitle id="cancel-dialog-title">{t('registration.cancelDialog.title')}</DialogTitle>
      <DialogContent>
        <DialogContentText id="cancel-dialog-description">
          {disabled
            ? t('registration.cancelDialog.lateText', {
                registration,
                event,
                contact: event.contactInfo?.secretary?.phone ?? event.contactInfo?.secretary?.email,
              })
            : t('registration.cancelDialog.text', { registration, event })}
        </DialogContentText>
        <DialogContentText id="cancel-dialog-description2" sx={{ py: 1, display: disabled ? 'none' : 'block' }}>
          {t('registration.cancelDialog.confirmation')}
        </DialogContentText>
        <DialogContentText id="cancel-dialog-description3" sx={{ py: 1 }}>
          <Trans t={t} i18nKey="registration.cancelDialog.terms">
            Katso tarkemmat peruutusehdot{' '}
            <Link
              target="_blank"
              rel="noopener"
              href="https://yttmk.yhdistysavain.fi/noutajien-metsastyskokeet-2/ohjeistukset/kokeen-ja-tai-kilpailun-ilmoitta/"
            >
              säännöistä
            </Link>
            .
          </Trans>
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={disabled} autoFocus variant="contained">
          {t('registration.cancelDialog.cta')}
        </Button>
        <Button onClick={onClose} variant="outlined">
          {t('cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
