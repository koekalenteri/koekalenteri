import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Link, Toolbar } from '@mui/material'
import { isPast, isToday } from 'date-fns'
import type { ConfirmedEvent, Registration } from 'koekalenteri-shared/model'
import { useSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue } from 'recoil'

import { putRegistration } from "../api/registration"
import { LinkButton } from '../components/Buttons'
import { RegistrationEventInfo } from '../components/RegistrationEventInfo'
import { RegistrationList } from '../components/RegistrationList'
import { useSessionStarted } from '../stores'

import Header from './components/Header'
import { currentEvent, eventIdAtom, registrationIdAtom, registrationQuery } from './recoil'


export function RegistrationListPage({cancel}: {cancel?: boolean}) {
  const params = useParams()
  const [eventId, setEventId] = useRecoilState(eventIdAtom)
  const [registrationId, setRegistrationId] = useRecoilState(registrationIdAtom)
  const event = useRecoilValue(currentEvent) as ConfirmedEvent | undefined
  const registration = useRecoilValue(registrationQuery)
  const [sessionStarted] = useSessionStarted()
  const { t } = useTranslation()

  useEffect(() => {
    if (params.id && params.registrationId) {
      if (params.id !== eventId) {
        setEventId(params.id)
      }
      if (params.registrationId !== registrationId) {
        setRegistrationId(params.registrationId)
      }
    }
  }, [eventId, params, registrationId, setEventId, setRegistrationId])

  return (
    <>
      <Header title={t('entryList', { context: event?.eventType === 'other' ? '' : 'test' })} />
      <Box sx={{ p: 1, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Toolbar variant="dense" />{/* To allocate the space for fixed header */}
        <LinkButton sx={{ mb: 1 }} to="/" text={sessionStarted ? t('goBack') : t('goHome')} />
        <PageContent event={event} registration={registration} cancel={cancel}/>
      </Box>
    </>
  )
}

function PageContent({ event, registration, cancel }: { event?: ConfirmedEvent, registration?: Registration, cancel?: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(!!cancel)
  const { enqueueSnackbar } = useSnackbar()
  const handleClose = () => {
    setOpen(false)
  }
  const cancelRegistrationAction = async () => {
    if (registration) {
      setOpen(false)
      try {
        registration.cancelled = true
        await putRegistration(registration)
        enqueueSnackbar(t('registration.cancelDialog.done'), { variant: 'info' })
      } catch (e: any) {
        enqueueSnackbar(e.message, { variant: 'error' })
      }
    }
  }
  useEffect(() => {
    if (open && registration?.cancelled) {
      setOpen(false)
    }
  }, [open, registration])

  if (!event) {
    return <CircularProgress />
  }
  const disableCancel = (e: ConfirmedEvent) => isPast(e.startDate) || isToday(e.startDate)
  return (
    <>
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
            {disableCancel(event)
              ? t('registration.cancelDialog.lateText', {
                registration,
                event,
                contact: event.contactInfo?.secretary?.phone ? event.secretary.phone : event.secretary.email,
              })
              : t('registration.cancelDialog.text', { registration, event })
            }
          </DialogContentText>
          <DialogContentText id="cancel-dialog-description2" sx={{py: 1, display: disableCancel(event) ? 'none' : 'block'}}>
            {t('registration.cancelDialog.confirmation')}
          </DialogContentText>
          <DialogContentText id="cancel-dialog-description3" sx={{py: 1}}>
            {t('registration.cancelDialog.terms')}<Link href={t('registration.terms.url')}>{t('registration.cancelDialog.terms_link')}</Link>.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelRegistrationAction} disabled={disableCancel(event)} autoFocus variant="contained">{t('registration.cancelDialog.cta')}</Button>
          <Button onClick={handleClose} variant="outlined">{t('cancel')}</Button>
        </DialogActions>
      </Dialog>
    </>
  )
}

