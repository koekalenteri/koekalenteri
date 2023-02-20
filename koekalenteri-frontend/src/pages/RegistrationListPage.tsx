import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Link, Toolbar } from '@mui/material'
import { isPast, isToday } from 'date-fns'
import type { ConfirmedEvent } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import Header from './components/Header'
import LinkButton from './components/LinkButton'
import RegistrationEventInfo from './components/RegistrationEventInfo'
import { useRegistrationActions } from './recoil/registration/actions'
import RegistrationList from './registrationListPage/RegistrationList'
import { currentEventSelector, registrationSelector, spaAtom } from './recoil'


export function RegistrationListPage({cancel}: {cancel?: boolean}) {
  const params = useParams()
  const event = useRecoilValue(currentEventSelector) as ConfirmedEvent | undefined
  const [registration, setRegistration] = useRecoilState(registrationSelector(`${params.id ?? ''}:${params.registrationId ?? ''}`))
  const spa = useRecoilValue(spaAtom)
  const { t } = useTranslation()
  const [open, setOpen] = useState(!!cancel)
  const actions = useRegistrationActions()
  const cancelDisabled = useMemo(() => !event || isPast(event.startDate) || isToday(event.startDate), [event])

  const handleCancel = useCallback(async () => {
    if (!registration) {
      return
    }
    const saved = await actions.cancel(registration)
    setRegistration(saved)
  }, [actions, registration, setRegistration])

  const handleClose = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (open && registration?.cancelled) {
      setOpen(false)
    }
  }, [open, registration])

  if (!event || !registration) {
    return <CircularProgress />
  }

  return (
    <>
      <Header title={t('entryList', { context: event?.eventType === 'other' ? '' : 'test' })} />
      <Box sx={{ p: 1, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Toolbar variant="dense" />{/* To allocate the space for fixed header */}
        <LinkButton sx={{ mb: 1 }} to="/" text={spa ? t('goBack') : t('goHome')} />
        <RegistrationEventInfo event={event} />
        <RegistrationList rows={registration ? [registration] : []} onUnregister={() => setOpen(true)} />
        <Dialog
          open={open}
          onClose={handleClose}
          aria-labelledby="cancel-dialog-title"
          aria-describedby="cancel-dialog-description"
        >
          <DialogTitle id="cancel-dialog-title">
            {t('registration.cancelDialog.title')}
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="cancel-dialog-description">
              {cancelDisabled
                ? t('registration.cancelDialog.lateText', {
                  registration,
                  event,
                  contact: event.contactInfo?.secretary?.phone ? event.secretary.phone : event.secretary.email,
                })
                : t('registration.cancelDialog.text', { registration, event })
              }
            </DialogContentText>
            <DialogContentText id="cancel-dialog-description2" sx={{py: 1, display: cancelDisabled ? 'none' : 'block'}}>
              {t('registration.cancelDialog.confirmation')}
            </DialogContentText>
            <DialogContentText id="cancel-dialog-description3" sx={{py: 1}}>
              {t('registration.cancelDialog.terms')}<Link href={t('registration.terms.url')}>{t('registration.cancelDialog.terms_link')}</Link>.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCancel} disabled={cancelDisabled} autoFocus variant="contained">{t('registration.cancelDialog.cta')}</Button>
            <Button onClick={handleClose} variant="outlined">{t('cancel')}</Button>
          </DialogActions>
        </Dialog>
      </Box>
    </>
  )
}
