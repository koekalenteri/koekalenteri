import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { CheckOutlined, EuroOutlined, PersonOutline } from '@mui/icons-material'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Grid,
  Link,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Paper,
  Typography,
} from '@mui/material'
import { isPast, isToday } from 'date-fns'
import type { ConfirmedEvent, Registration } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import Header from './components/Header'
import LinkButton from './components/LinkButton'
import RegistrationEventInfo from './components/RegistrationEventInfo'
import { useRegistrationActions } from './recoil/registration/actions'
import RegistrationList from './registrationListPage/RegistrationList'
import { LoadingPage } from './LoadingPage'
import { eventSelector, registrationSelector, spaAtom } from './recoil'

export function RegistrationListPage({ cancel }: { cancel?: boolean }) {
  const params = useParams()
  const event = useRecoilValue(eventSelector(params.id ?? '')) as ConfirmedEvent | undefined | null
  const [registration, setRegistration] = useRecoilState(
    registrationSelector(`${params.id ?? ''}:${params.registrationId ?? ''}`)
  )
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

  useEffect(() => {
    if (event === null) {
      throw new Response('Event not found', { status: 404, statusText: t('error.eventNotFound') })
    } else if (registration === null) {
      throw new Response('Event not found', { status: 404, statusText: t('error.registrationNotFound') })
    }
  }, [event, registration, t])

  if (!event || !registration) {
    return <LoadingPage />
  }

  return (
    <>
      <Header />
      <Box
        sx={{
          p: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        <Grid container direction="row" wrap="nowrap">
          <Grid item>
            <LinkButton sx={{ mb: 1, pl: 0 }} to="/" back={spa} text={spa ? t('goBack') : t('goHome')} />
            <Typography variant="h5">Ilmoittutumistiedot</Typography>
            <RegistrationEventInfo event={event} />
          </Grid>
          <Grid item>
            <Paper sx={{ bgcolor: 'background.selected', p: 1, m: 1, width: 350 }}>
              <List disablePadding>
                <ListItem disablePadding>
                  <ListItemIcon sx={{ minWidth: 32, color: membershipIconColor(event, registration) }}>
                    <PersonOutline fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={membershipStatus(event, registration)}
                    primaryTypographyProps={{ variant: 'subtitle1', fontWeight: 'bold' }}
                  />
                </ListItem>
                <ListItem disablePadding>
                  <ListItemIcon sx={{ minWidth: 32, color: paymentIconColor(registration) }}>
                    <EuroOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={paymentStatus(registration)}
                    primaryTypographyProps={{ variant: 'subtitle1', fontWeight: 'bold' }}
                  />
                </ListItem>
                <ListItem disablePadding>
                  <ListItemIcon sx={{ minWidth: 32, color: 'primary.main' }}>
                    <CheckOutlined fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={registrationStatus(registration)}
                    primaryTypographyProps={{ variant: 'subtitle1', fontWeight: 'bold' }}
                  />
                </ListItem>
              </List>
            </Paper>
          </Grid>
        </Grid>
        <RegistrationList rows={registration ? [registration] : []} onUnregister={() => setOpen(true)} />
        <Dialog
          open={open}
          onClose={handleClose}
          aria-labelledby="cancel-dialog-title"
          aria-describedby="cancel-dialog-description"
        >
          <DialogTitle id="cancel-dialog-title">{t('registration.cancelDialog.title')}</DialogTitle>
          <DialogContent>
            <DialogContentText id="cancel-dialog-description">
              {cancelDisabled
                ? t('registration.cancelDialog.lateText', {
                    registration,
                    event,
                    contact: event.contactInfo?.secretary?.phone ? event.secretary.phone : event.secretary.email,
                  })
                : t('registration.cancelDialog.text', { registration, event })}
            </DialogContentText>
            <DialogContentText
              id="cancel-dialog-description2"
              sx={{ py: 1, display: cancelDisabled ? 'none' : 'block' }}
            >
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
            <Button onClick={handleCancel} disabled={cancelDisabled} autoFocus variant="contained">
              {t('registration.cancelDialog.cta')}
            </Button>
            <Button onClick={handleClose} variant="outlined">
              {t('cancel')}
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </>
  )
}

function membershipIconColor(event: ConfirmedEvent, registration: Registration) {
  if (
    (event.allowHandlerMembershipPriority && registration.handler.membership) ||
    (event.allowOwnerMembershipPriority && registration.owner.membership)
  ) {
    return 'primary.main'
  }
  return 'transparent'
}

function membershipStatus(event: ConfirmedEvent, registration: Registration) {
  if (
    (event.allowHandlerMembershipPriority && registration.handler.membership) ||
    (event.allowOwnerMembershipPriority && registration.owner.membership)
  ) {
    return 'Olen jäsen'
  }
  return 'En ole jäsen'
}

function paymentIconColor(registration: Registration) {
  return registration.paymentStatus === 'SUCCESS' ? 'primary.main' : 'transparent'
}

function paymentStatus(registration: Registration) {
  return registration.paymentStatus === 'SUCCESS' ? 'Olen maksanut' : 'En ole maksanut'
}

function registrationStatus(registration: Registration) {
  if (registration.cancelled) {
    return 'Olen perunut ilmoittautumiseni'
  }
  return registration.confirmed ? 'Olen vahvistanut ilmoittautumiseni' : 'Ilmoittautuminen vastaanotettu'
}
