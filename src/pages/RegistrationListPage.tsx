import Box from '@mui/material/Box'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { isPast } from 'date-fns/isPast'
import { useAtom, useAtomValue } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate, useParams } from 'react-router'
import { useRegistrationLanguage } from '../hooks/useRegistrationLanguage'
import { useRegistrationSubscription } from '../hooks/useRegistrationSubscription'
import { redirectTo } from '../lib/client/navigation'
import { errorSnackbarOptions } from '../lib/client/snackbar'
import { addDays, dayOf, TIME_ZONE } from '../lib/day'
import { getEventStateForClass } from '../lib/event'
import { getRegistrationClass, getRegistrationEmails, hasPaymentPicture } from '../lib/registration'
import { isConfirmedEvent } from '../lib/typeGuards'
import { Path } from '../routeConfig'
import CancelDialog from './components/CancelDialog'
import Header from './components/Header'
import { HiddenPageTitle } from './components/HiddenPageTitle'
import LinkButton from './components/LinkButton'
import { PaymentDetails } from './components/PaymentDetails'
import RegistrationEventInfo from './components/RegistrationEventInfo'
import { LoadingPage } from './LoadingPage'
import { ConfirmDialog } from './registrationListPage/ConfirmDialog'
import { InfoBox } from './registrationListPage/InfoBox'
import { PaymentDialog } from './registrationListPage/PaymentDialog'
import RegistrationList from './registrationListPage/RegistrationList'
import { registrationAtom, spaAtom, useConfirmedEvent } from './state'
import { useRegistrationActions } from './state/registration/actions'

export interface RegistrationListPageProps {
  readonly cancel?: boolean
  readonly confirm?: boolean
  readonly invitation?: boolean
}

const PAYMENT_RELOAD_INTERVAL_MS = 30_000

export function RegistrationListPage({ cancel, confirm, invitation }: RegistrationListPageProps) {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const event = useConfirmedEvent(params.id)
  const [registration, setRegistration] = useAtom(
    registrationAtom(`${params.id ?? ''}:${params.registrationId ?? ''}:${params.editToken ?? ''}`)
  )
  useRegistrationLanguage(registration)
  const spa = useAtomValue(spaAtom)
  const eventNotFound = event === null
  const { t } = useTranslation()
  const [cancelOpen, setCancelOpen] = useState<boolean | null>(null)
  const [confirmOpen, setConfirmOpen] = useState<boolean | null>(null)
  const [confirmPending, setConfirmPending] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  const [reloadCount, setReloadCount] = useState(0)
  const [paymentOpen, setPaymentOpen] = useState<boolean | null>(null)
  const actions = useRegistrationActions()
  useRegistrationSubscription(registration, setRegistration)
  const paymentFlow = new URLSearchParams(location.search).get('payment')
  // Still verifying for as long as the picture has no payment standing and none charged twice. A
  // fresh payment transaction stays `new` until the callback, so `inProgress` (pending only) is false
  // for exactly the window this flag covers -- keying it on that would end the loop at once and
  // re-offer Pay (KOE-1529).
  const payment = registration?.payment
  const paymentSettled = Boolean(payment?.standing) || payment?.status === 'duplicate'
  const paymentVerificationInProgress = paymentFlow === 'verifying' && !paymentSettled && reloadCount < 5
  const allDisabled = useMemo(() => !event || !isConfirmedEvent(event) || isPast(event.endDate), [event])
  const cancelDisabled = useMemo(
    // Cancelling closes with the Finnish day before the trial: from then on the dog is expected.
    () => !event || allDisabled || dayOf(new Date(), TIME_ZONE) >= addDays(dayOf(event.startDate, TIME_ZONE), -1),
    [allDisabled, event]
  )
  // What the page shows as owed: the server's word, which needs the group this page does not have
  // (KOE-1526, KOE-1530).
  const paymentDue = payment?.due ?? 0

  const handleCancel = useCallback(
    (reason: string) => {
      if (allDisabled || !registration) {
        return
      }
      actions.cancel(registration, reason).then(
        (saved) => {
          void setRegistration(saved)
          setCancelOpen(false)
        },
        (error_) => {
          console.error(error_)
        }
      )
    },
    [actions, allDisabled, registration, setRegistration]
  )

  const handleConfirm = useCallback(async () => {
    if (confirmPending) {
      return
    }
    if (allDisabled || !event || !registration || registration.confirmed || registration.cancelled) {
      setConfirmOpen(false)
      return
    }
    setConfirmPending(true)
    try {
      const saved = await actions.confirm(registration, event)
      if (!saved) return
      await setRegistration(saved)
      setConfirmOpen(false)
    } catch (error_) {
      console.error(error_)
      // A silent failure looks like a dead button (KOE-1265) — always tell the user something.
      enqueueSnackbar(t('registration.notifications.confirmFailed'), errorSnackbarOptions)
    } finally {
      setConfirmPending(false)
    }
  }, [actions, allDisabled, confirmPending, event, registration, setRegistration, t])

  const handlePayment = useCallback(async () => {
    if (allDisabled || !registration || registration.cancelled) {
      return
    }
    await navigate(Path.payment(registration))
  }, [allDisabled, registration, navigate])

  const handleCalcelClose = useCallback(() => setCancelOpen(false), [])
  const handleConfirmClose = useCallback(() => setConfirmOpen(false), [])
  const handlePaymentClose = useCallback(() => setPaymentOpen(false), [])

  useEffect(() => {
    if (invitation && registration && event && !redirecting) {
      setRedirecting(true)
      actions.invitationRead(registration).then(
        (saved) => {
          if (saved !== registration) {
            void setRegistration(saved)
          }
          if (
            registration.invitationAttachment &&
            getEventStateForClass(event, getRegistrationClass(registration)) === 'invited'
          ) {
            redirectTo(Path.invitationAttachment(registration))
          } else {
            void navigate(Path.registration(registration))
          }
        },
        (error_) => {
          console.error(error_)
        }
      )
    }
  }, [registration, invitation, event, actions, setRegistration, navigate, redirecting])

  useEffect(() => {
    if (!registration) return
    if (location.pathname.endsWith('/saved')) {
      if (registration?.messagesSent?.picked && registration.payment?.standing) {
        enqueueSnackbar(
          t('registration.paidAndConfirmed', {
            to: registration.payer?.email,
          }),
          { style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' }, variant: 'success' }
        )
      } else if (registration?.payment?.standing) {
        const emails = getRegistrationEmails(registration)

        enqueueSnackbar(
          t('registration.saved', {
            count: emails.length,
            to: emails.join('\n'),
          }),
          { style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' }, variant: 'success' }
        )
      }

      const search = paymentFlow === 'verifying' && !registration.payment?.standing ? '?payment=verifying' : ''
      void navigate(`${Path.registration(registration)}${search}`, { replace: true })
    }
  }, [location.pathname, navigate, paymentFlow, registration, t])

  useEffect(() => {
    if (!paymentVerificationInProgress) {
      return
    }

    enqueueSnackbar(t('registration.notifications.paymentVerifying'), { variant: 'info' })
  }, [paymentVerificationInProgress, t])

  useEffect(() => {
    if ((!paymentVerificationInProgress && payment?.status !== 'inProgress') || reloadCount >= 5 || !registration) {
      return
    }

    const reload = async () => {
      const reg = await actions.reload(registration)
      setReloadCount((old) => old + 1)
      await setRegistration(reg)
    }

    const timeout = setTimeout(reload, PAYMENT_RELOAD_INTERVAL_MS)

    return () => clearTimeout(timeout)
  }, [actions, payment?.status, paymentVerificationInProgress, registration, reloadCount, setRegistration])

  useEffect(() => {
    if (!event || !registration || registration.cancelled) return
    // On the confirm route the confirm dialog goes first: the payment dialog would stack on top of
    // it and its backdrop would swallow the confirm button (KOE-1265). It opens once confirmed.
    if (confirm && !registration.confirmed) return

    // The same offer as the pay button: the server's picture, never while a payment is being
    // verified (KOE-1526).
    if (paymentDue > 0 && registration.messagesSent?.picked && payment?.canPay && !paymentVerificationInProgress) {
      setPaymentOpen((current) => current ?? true)
    }
  }, [confirm, event, registration, payment, paymentDue, paymentVerificationInProgress])

  useEffect(() => {
    if (!registration || registration.cancelled) return

    if (cancel) {
      setCancelOpen((current) => current ?? true)
    }
  }, [cancel, registration])

  useEffect(() => {
    if (!event || !registration || registration.cancelled || registration.confirmed) return

    if (confirm && isConfirmedEvent(event) && !isPast(event.endDate)) {
      setConfirmOpen((current) => current ?? true)
    }
  }, [confirm, event, registration])

  // A page with nothing but a sentence to show still has a name for a screen reader (KOE-1519).
  if (eventNotFound || registration === null) {
    return (
      <>
        <HiddenPageTitle>{t('entryList')}</HiddenPageTitle>
        {eventNotFound ? t('error.eventNotFound') : t('error.registrationNotFound')}
      </>
    )
  }

  // Every response to the participant carries the picture; without it the page has nothing to say of the payment.
  if (!event || !registration || !hasPaymentPicture(registration)) {
    return <LoadingPage />
  }

  return (
    <>
      <Header />
      <Box
        sx={{
          alignItems: 'flex-start',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Grid
          container
          direction="row"
          sx={{
            borderBottom: '2px solid',
            borderColor: 'background.hover',
            justifyContent: 'end',
            width: '100%',
          }}
        >
          <Grid
            sx={{
              flexGrow: 1,
              pl: 1,
            }}
          >
            <LinkButton sx={{ mb: 1, pl: 0 }} to="/" back={spa} text={spa ? t('goBack') : t('goHome')} />
            <Typography variant="h2" component="h1">
              {t('entryList')}
            </Typography>
          </Grid>
          <Grid>
            <InfoBox
              event={event}
              registration={registration}
              onConfirm={() => setConfirmOpen(true)}
              paymentVerificationInProgress={paymentVerificationInProgress}
            />
          </Grid>
        </Grid>
        <RegistrationEventInfo
          event={event}
          eventClass={getRegistrationClass(registration)}
          invitationAttachment={registration.invitationAttachment}
          invitationAttachmentUpdatedAt={registration.invitationAttachmentUpdatedAt}
          hideCostInfo
        />
        <RegistrationList
          disabled={allDisabled}
          event={event}
          paymentVerificationInProgress={paymentVerificationInProgress}
          rows={registration ? [registration] : []}
          onUnregister={() => setCancelOpen(true)}
        />
        {/* What this registration bought and at what price - the event's full price list says nothing
            about the choices made in it (KOE-1055). */}
        <Box sx={{ mb: 1, p: { md: 1, xs: 0.5 }, width: '100%' }}>
          <Typography variant="h2">{t('paymentDetails')}</Typography>
          <PaymentDetails event={event} registration={registration} includeTotal includePayable={paymentDue > 0} />
        </Box>
        <CancelDialog
          disabled={cancelDisabled}
          event={event}
          onCancel={handleCancel}
          onClose={handleCalcelClose}
          open={cancelOpen ?? false}
          registration={registration}
        />
        <ConfirmDialog
          open={confirmOpen ?? false}
          onClose={handleConfirmClose}
          registration={registration}
          event={event}
          pending={confirmPending}
          onConfirm={handleConfirm}
        />
        <PaymentDialog
          open={paymentOpen ?? false}
          onClose={handlePaymentClose}
          registration={registration}
          event={event}
          onConfirm={handlePayment}
        />
      </Box>
    </>
  )
}
