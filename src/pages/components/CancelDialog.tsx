import type { SelectChangeEvent } from '@mui/material/Select'
import type { ChangeEvent } from 'react'
import type { PublicDogEvent, Registration } from '../../types'

import { useCallback, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import InputLabel from '@mui/material/InputLabel'
import Link from '@mui/material/Link'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'

import { isPredefinedReason } from '../../lib/registration'

interface Props {
  readonly admin?: boolean
  readonly disabled?: boolean
  readonly event: PublicDogEvent | null | undefined
  readonly onCancel?: (reason: string) => void
  readonly onClose?: () => void
  readonly open: boolean
  readonly registration: Registration | null | undefined
}

const CancelDialog = ({ admin, disabled, event, onCancel, onClose, open, registration }: Props) => {
  const { t } = useTranslation()
  const [reason, setReason] = useState(
    registration?.cancelReason && isPredefinedReason(registration.cancelReason) ? registration.cancelReason : ''
  )
  const [freeReason, setFreeReason] = useState(
    registration?.cancelReason && !isPredefinedReason(registration.cancelReason) ? registration?.cancelReason : ''
  )

  const handleReasonChange = useCallback((event: SelectChangeEvent) => {
    setReason(event.target.value)
  }, [])

  const handleFreeReasonChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setFreeReason(event.target.value)
  }, [])

  const handleCancel = useCallback(
    () => onCancel?.(reason === 'other' ? freeReason : reason),
    [freeReason, onCancel, reason]
  )

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
        <FormControl fullWidth sx={{ my: 1 }}>
          <InputLabel id="reason-label">{t('registration.cancelDialog.reason')}</InputLabel>
          <Select
            id="reaseon"
            labelId="reason-label"
            label={t('registration.cancelDialog.reason')}
            value={reason}
            onChange={handleReasonChange}
          >
            <MenuItem value="dog-heat">{t('registration.cancelReason.dog-heat')}</MenuItem>
            <MenuItem value="handler-sick">{t('registration.cancelReason.handler-sick')}</MenuItem>
            <MenuItem value="dog-sick">{t('registration.cancelReason.dog-sick')}</MenuItem>
            <MenuItem value="other">{t('registration.cancelReason.other')}</MenuItem>
            <MenuItem value="gdpr">{t('registration.cancelReason.gdpr')}</MenuItem>
          </Select>
          <FormHelperText>
            {!admin && (reason === 'handler-sick' || reason === 'dog-sick') && (
              <>
                {t(`registration.cancelReason.${reason}-info`)} &nbsp;
                <a href={`mailto://${event.contactInfo?.secretary?.email}`}>{event.contactInfo?.secretary?.email}</a>
              </>
            )}
          </FormHelperText>
        </FormControl>
        {reason === 'other' && (
          <TextField
            fullWidth
            label={t('registration.cancelDialog.reason_other')}
            value={freeReason}
            onChange={handleFreeReasonChange}
          />
        )}
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
        <Button
          onClick={handleCancel}
          disabled={disabled || reason === '' || (reason === 'other' && freeReason === '')}
          autoFocus
          variant="contained"
        >
          {t('registration.cancelDialog.cta')}
        </Button>
        <Button onClick={onClose} variant="outlined">
          {t('close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default CancelDialog
