import type { ConfirmedEvent, Registration } from 'koekalenteri-shared/model'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useParams } from 'react-router-dom'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import PersonOutline from '@mui/icons-material/PersonOutline'
import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { isPast, isToday } from 'date-fns'
import { useRecoilState, useRecoilValue } from 'recoil'

import { Path } from '../routeConfig'

import Header from './components/Header'
import LinkButton from './components/LinkButton'
import RegistrationEventInfo from './components/RegistrationEventInfo'
import { useRegistrationActions } from './recoil/registration/actions'
import { CancelDialog } from './registrationListPage/CancelDialog'
import { ConfirmDialog } from './registrationListPage/ConfirmDialog'
import RegistrationList from './registrationListPage/RegistrationList'
import { LoadingPage } from './LoadingPage'
import { confirmedEventSelector, registrationSelector, spaAtom } from './recoil'

interface Props {
  cancel?: boolean
  confirm?: boolean
  invitation?: boolean
}

export function RegistrationListPage({ cancel, confirm, invitation }: Props) {
  const params = useParams()
  const navigate = useNavigate()
  const event = useRecoilValue(confirmedEventSelector(params.id))
  const [registration, setRegistration] = useRecoilState(
    registrationSelector(`${params.id ?? ''}:${params.registrationId ?? ''}`)
  )
  const spa = useRecoilValue(spaAtom)
  const { t } = useTranslation()
  const [cancelOpen, setCancelOpen] = useState(!!cancel)
  const [confirmOpen, setConfirmOpen] = useState(!!confirm)
  const [redirecting, setRedirecting] = useState(false)
  const actions = useRegistrationActions()
  const cancelDisabled = useMemo(() => !event || isPast(event.startDate) || isToday(event.startDate), [event])

  const handleCancel = useCallback(() => {
    if (!registration) {
      return
    }
    actions.cancel(registration).then(
      (saved) => {
        setRegistration(saved)
        setCancelOpen(false)
      },
      (reason) => {
        console.error(reason)
      }
    )
  }, [actions, registration, setRegistration])

  const handleConfirm = useCallback(() => {
    if (!registration || registration.confirmed || registration.cancelled) {
      return
    }
    actions.confirm(registration).then(
      (saved) => {
        setRegistration(saved)
        setConfirmOpen(false)
      },
      (reason) => {
        console.error(reason)
      }
    )
  }, [actions, registration, setRegistration])

  const handleCalcelClose = useCallback(() => setCancelOpen(false), [])
  const handleConfirmClose = useCallback(() => setConfirmOpen(false), [])

  useEffect(() => {
    if (cancelOpen && registration?.cancelled) {
      setCancelOpen(false)
    }
    if (confirmOpen && (registration?.confirmed || registration?.cancelled)) {
      setConfirmOpen(false)
    }
    if (invitation && registration && event && !redirecting) {
      setRedirecting(true)
      actions.invitationRead(registration).then(
        (saved) => {
          if (saved !== registration) {
            setRegistration(saved)
          }
          if (event.invitationAttachment && event.state === 'invited') {
            console.log('but why?', redirecting)
            window.location.replace(Path.invitationAttachment(event))
          } else {
            navigate(Path.registration(registration))
          }
        },
        (reason) => {
          console.error(reason)
        }
      )
    }
  }, [cancelOpen, confirmOpen, registration, invitation, event, actions, setRegistration, navigate, redirecting])

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
            <Typography variant="h5">Ilmoittautumistiedot</Typography>
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
        <RegistrationList rows={registration ? [registration] : []} onUnregister={() => setCancelOpen(true)} />
        <CancelDialog
          open={cancelOpen}
          onClose={handleCalcelClose}
          disabled={cancelDisabled}
          registration={registration}
          event={event}
          onCancel={handleCancel}
        />
        <ConfirmDialog
          open={confirmOpen}
          onClose={handleConfirmClose}
          registration={registration}
          event={event}
          onConfirm={handleConfirm}
        />
      </Box>
    </>
  )
}

const hasPriority = (event: ConfirmedEvent, registration: Registration) => {
  if (event.priority?.includes('member') && (registration.handler.membership || registration.owner.membership)) {
    return true
  }
  if (event.priority?.includes(registration.dog.breedCode ?? '')) {
    return true
  }
  if (event.priority?.includes('invited') && registration.priorityByInvitation) {
    return true
  }
  return false
}

function membershipIconColor(event: ConfirmedEvent, registration: Registration) {
  if (hasPriority(event, registration)) {
    return 'primary.main'
  }
  return 'transparent'
}

function membershipStatus(event: ConfirmedEvent, registration: Registration) {
  if (hasPriority(event, registration)) {
    return 'Olen etusijalla'
  }
  return 'En ole etusijalla'
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
  return registration.confirmed ? 'Olen vahvistanut osallistumiseni' : 'Ilmoittautuminen vastaanotettu'
}
