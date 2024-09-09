import type { PublicDogEvent, Registration } from '../types'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import PersonOutline from '@mui/icons-material/PersonOutline'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Grid2 from '@mui/material/Grid2'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { isPast, subDays } from 'date-fns'
import { enqueueSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue } from 'recoil'

import { hasPriority } from '../lib/registration'
import { isConfirmedEvent } from '../lib/typeGuards'
import { Path } from '../routeConfig'

import CancelDialog from './components/CancelDialog'
import Header from './components/Header'
import LinkButton from './components/LinkButton'
import RegistrationEventInfo from './components/RegistrationEventInfo'
import { useRegistrationActions } from './recoil/registration/actions'
import { ConfirmDialog } from './registrationListPage/ConfirmDialog'
import RegistrationList from './registrationListPage/RegistrationList'
import { LoadingPage } from './LoadingPage'
import { eventSelector, registrationSelector, spaAtom } from './recoil'

interface Props {
  readonly cancel?: boolean
  readonly confirm?: boolean
  readonly invitation?: boolean
}

export function RegistrationListPage({ cancel, confirm, invitation }: Props) {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const event = useRecoilValue(eventSelector(params.id))
  const [registration, setRegistration] = useRecoilState(
    registrationSelector(`${params.id ?? ''}:${params.registrationId ?? ''}`)
  )
  const spa = useRecoilValue(spaAtom)
  const { t } = useTranslation()
  const [cancelOpen, setCancelOpen] = useState(!!cancel)
  const [confirmOpen, setConfirmOpen] = useState(!!confirm)
  const [redirecting, setRedirecting] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)
  const actions = useRegistrationActions()
  const allDisabled = useMemo(() => !event || !isConfirmedEvent(event) || isPast(event.endDate), [event])
  const cancelDisabled = useMemo(
    () => !event || allDisabled || isPast(subDays(event.startDate, 2)),
    [allDisabled, event]
  )

  const handleCancel = useCallback(
    (reason: string) => {
      if (allDisabled || !registration) {
        return
      }
      actions.cancel(registration, reason).then(
        (saved) => {
          setRegistration(saved)
          setCancelOpen(false)
        },
        (reason) => {
          console.error(reason)
        }
      )
    },
    [actions, allDisabled, registration, setRegistration]
  )

  const handleConfirm = useCallback(() => {
    if (allDisabled || !registration || registration.confirmed || registration.cancelled) {
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
  }, [actions, allDisabled, registration, setRegistration])

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
          if (registration.invitationAttachment && event.state === 'invited') {
            window.location.replace(Path.invitationAttachment(registration))
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
      throw new Response('Registration not found', { status: 404, statusText: t('error.registrationNotFound') })
    }
  }, [event, registration, t])

  useEffect(() => {
    if (!registration) return

    if (location.pathname.endsWith('/saved')) {
      const emails = [registration.handler.email]
      if (registration.owner.email !== registration.handler.email) {
        emails.push(registration.owner.email)
      }

      if (registration.paymentStatus === 'SUCCESS') {
        enqueueSnackbar(
          t('registration.saved', {
            count: emails.length,
            to: emails.join('\n'),
          }),
          { variant: 'success', style: { whiteSpace: 'pre-line' } }
        )
      }
      navigate(Path.registration(registration), { replace: true })
    }
  }, [location.pathname, navigate, registration, t])

  useEffect(() => {
    if (registration?.paymentStatus !== 'PENDING' || reloadCount >= 5) {
      return
    }

    const reload = async () => {
      const reg = await actions.reload(registration)
      setReloadCount((old) => old + 1)
      setRegistration(reg)
    }

    const timeout = setTimeout(reload, 10_000)

    return () => clearTimeout(timeout)
  }, [actions, registration, reloadCount, setRegistration])

  if (!event || !registration) {
    return <LoadingPage />
  }

  return (
    <>
      <Header />
      <Box
        sx={{
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
        }}
      >
        <Grid2 container direction="row" flexWrap="nowrap" justifyContent="space-between">
          <Grid2>
            <Box pl={1}>
              <LinkButton sx={{ mb: 1, pl: 0 }} to="/" back={spa} text={spa ? t('goBack') : t('goHome')} />
              <Typography variant="h5">Ilmoittautumistiedot</Typography>
            </Box>
            <RegistrationEventInfo event={event} invitationAttachment={registration.invitationAttachment} />
          </Grid2>
          <Grid2 sx={{ display: { xs: 'none', sm: 'none', md: 'unset' } }}>
            <Paper sx={{ bgcolor: 'background.selected', p: 1, m: 1, width: 350 }}>
              <List disablePadding>
                <ListItem disablePadding>
                  <ListItemIcon sx={{ minWidth: 32, color: priorityIconColor(event, registration) }}>
                    <PersonOutline fontSize="small" />
                  </ListItemIcon>
                  <ListItemText
                    primary={priorityStatus(event, registration)}
                    primaryTypographyProps={{ variant: 'subtitle1', fontWeight: 'bold' }}
                  />
                </ListItem>
                <ListItem
                  disablePadding
                  secondaryAction={
                    !registration.cancelled &&
                    registration.paymentStatus !== 'SUCCESS' &&
                    registration.paymentStatus !== 'PENDING' ? (
                      <Button
                        aria-label={t('registration.cta.pay')}
                        onClick={() => navigate(Path.payment(registration))}
                      >
                        {t('registration.cta.pay')}
                      </Button>
                    ) : null
                  }
                >
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
          </Grid2>
        </Grid2>
        <RegistrationList
          disabled={allDisabled}
          event={event}
          rows={registration ? [registration] : []}
          onUnregister={() => setCancelOpen(true)}
        />
        <CancelDialog
          disabled={cancelDisabled}
          event={event}
          onCancel={handleCancel}
          onClose={handleCalcelClose}
          open={cancelOpen}
          registration={registration}
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

function priorityIconColor(event: PublicDogEvent, registration: Registration) {
  if (hasPriority(event, registration)) {
    return 'primary.main'
  }
  return 'transparent'
}

function priorityStatus(event: PublicDogEvent, registration: Registration) {
  if (hasPriority(event, registration)) {
    return 'Olen etusijalla'
  }
  return 'En ole etusijalla'
}

function paymentIconColor(registration: Registration) {
  return registration.paymentStatus === 'SUCCESS' ? 'primary.main' : 'transparent'
}

function paymentStatus(registration: Registration) {
  if (registration.paymentStatus === 'SUCCESS') return 'Olen maksanut'
  if (registration.paymentStatus === 'PENDING') return 'Odottaa maksun käsittelyä'
  return 'Koemaksu puuttuu vielä'
}

function registrationStatus(registration: Registration) {
  if (registration.cancelled) {
    return 'Olen perunut ilmoittautumiseni'
  }
  return registration.confirmed ? 'Olen vahvistanut osallistumiseni' : 'Ilmoittautuminen vastaanotettu'
}
