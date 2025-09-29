import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams } from 'react-router'
import Box from '@mui/material/Box'
import Grid2 from '@mui/material/Grid2'
import Typography from '@mui/material/Typography'
import { isPast, subDays } from 'date-fns'
import { enqueueSnackbar } from 'notistack'
import { useRecoilState, useRecoilValue } from 'recoil'

import { calculateCost } from '../lib/cost'
import { isConfirmedEvent } from '../lib/typeGuards'
import { Path } from '../routeConfig'

import CancelDialog from './components/CancelDialog'
import Header from './components/Header'
import LinkButton from './components/LinkButton'
import RegistrationEventInfo from './components/RegistrationEventInfo'
import { useRegistrationActions } from './recoil/registration/actions'
import { ConfirmDialog } from './registrationListPage/ConfirmDialog'
import { InfoBox } from './registrationListPage/InfoBox'
import { PaymentDialog } from './registrationListPage/PaymentDialog'
import RegistrationList from './registrationListPage/RegistrationList'
import { LoadingPage } from './LoadingPage'
import { confirmedEventSelector, languageAtom, registrationSelector, spaAtom } from './recoil'

interface Props {
  readonly cancel?: boolean
  readonly confirm?: boolean
  readonly invitation?: boolean
}

export function RegistrationListPage({ cancel, confirm, invitation }: Props) {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const event = useRecoilValue(confirmedEventSelector(params.id))
  const [registration, setRegistration] = useRecoilState(
    registrationSelector(`${params.id ?? ''}:${params.registrationId ?? ''}`)
  )
  const [language, setLanguage] = useRecoilState(languageAtom)
  const spa = useRecoilValue(spaAtom)
  const { t } = useTranslation()
  const [cancelOpen, setCancelOpen] = useState(!!cancel && !registration?.cancelled)
  const [confirmOpen, setConfirmOpen] = useState(
    !!confirm &&
      !registration?.confirmed &&
      !registration?.cancelled &&
      !!event &&
      isConfirmedEvent(event) &&
      !isPast(event.endDate)
  )
  const [redirecting, setRedirecting] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const actions = useRegistrationActions()
  const allDisabled = useMemo(() => !event || !isConfirmedEvent(event) || isPast(event.endDate), [event])
  const cancelDisabled = useMemo(
    () => !event || allDisabled || isPast(subDays(event.startDate, 2)),
    [allDisabled, event]
  )
  const costResult = event && registration && calculateCost(event, registration)

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
      setConfirmOpen(false)
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

  const handlePayment = useCallback(async () => {
    if (allDisabled || !registration || registration.cancelled) {
      return
    }
    await navigate(Path.payment(registration))
  }, [actions, allDisabled, registration, setRegistration])

  const handleCalcelClose = useCallback(() => setCancelOpen(false), [])
  const handleConfirmClose = useCallback(() => setConfirmOpen(false), [])
  const handlePaymentClose = useCallback(() => setPaymentOpen(false), [])

  useEffect(() => {
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
      if (registration?.messagesSent?.picked && registration.paymentStatus === 'SUCCESS') {
        enqueueSnackbar(
          t('registration.paidAndConfirmed', {
            to: registration.payer?.email,
          }),
          { variant: 'success', style: { whiteSpace: 'pre-line', overflowWrap: 'break-word' } }
        )
      } else if (registration?.paymentStatus === 'SUCCESS') {
        const emails = [registration.handler?.email]
        if (registration.owner && registration.owner?.email !== registration.handler?.email) {
          emails.push(registration.owner.email)
        }

        enqueueSnackbar(
          t('registration.saved', {
            count: emails.length,
            to: emails.join('\n'),
          }),
          { variant: 'success', style: { whiteSpace: 'pre-line', overflowWrap: 'break-word' } }
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

  useEffect(() => {
    if (!event || !registration) return

    if ((registration.paidAmount ?? 0) < (costResult?.amount ?? 0) && registration.messagesSent?.picked) {
      setPaymentOpen(true)
    }
  }, [event, registration, costResult])

  useEffect(() => {
    if (registration?.language && registration.language !== language) {
      setLanguage(registration.language)
    }
  }, [])

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
        <Grid2
          container
          direction="row"
          justifyContent="end"
          width="100%"
          sx={{ borderBottom: '2px solid', borderColor: 'background.hover' }}
        >
          <Grid2 sx={{ pl: 1 }} flexGrow={1}>
            <LinkButton sx={{ mb: 1, pl: 0 }} to="/" back={spa} text={spa ? t('goBack') : t('goHome')} />
            <Typography variant="h5">{t('entryList')}</Typography>
          </Grid2>
          <Grid2>
            <InfoBox event={event} registration={registration} />
          </Grid2>
        </Grid2>
        <RegistrationEventInfo event={event} invitationAttachment={registration.invitationAttachment} hideCostInfo />
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
        <PaymentDialog
          open={paymentOpen}
          onClose={handlePaymentClose}
          registration={registration}
          event={event}
          onConfirm={handlePayment}
        />
      </Box>
    </>
  )
}
