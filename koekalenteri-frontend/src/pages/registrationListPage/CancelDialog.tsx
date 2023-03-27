import { Trans, useTranslation } from 'react-i18next'
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Link } from '@mui/material'
import { ConfirmedEvent, Registration } from 'koekalenteri-shared/model'

interface Props {
  disabled: boolean
  event: ConfirmedEvent | null | undefined
  onCancel: () => void
  onClose: () => void
  open: boolean
  registration: Registration | null | undefined
}

export function CancelDialog({ disabled, event, onCancel, onClose, open, registration }: Props) {
  const { t } = useTranslation()

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
                contact: event.contactInfo?.secretary?.phone ? event.secretary.phone : event.secretary.email,
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