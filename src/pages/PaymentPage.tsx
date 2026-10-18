import type { Params } from 'react-router'
import type { CreatePaymentResult } from '../api/payment'
import type { CreatePaymentResponse, PaymentPictureStatus, PublicConfirmedEvent, Registration } from '../types'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useAtomValue, useSetAtom } from 'jotai'
import { Suspense, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Await, useLoaderData, useParams } from 'react-router'
import { APIError } from '../api/http'
import { createPayment } from '../api/payment'
import { useRegistrationLanguage } from '../hooks/useRegistrationLanguage'
import { paytrailErrorText } from '../lib/payment'
import { hasPaymentPicture } from '../lib/registration'
import { printContactInfo } from '../lib/utils'
import { Path } from '../routeConfig'
import { ErrorInfo } from './components/ErrorInfo'
import { HiddenPageTitle } from './components/HiddenPageTitle'
import LinkButton from './components/LinkButton'
import { PaymentDetails } from './components/PaymentDetails'
import { PAYMENT_STATUS_KEY } from './components/paymentStatus'
import { RegistrationDetails } from './components/RegistrationDetails'
import { LoadingPage } from './LoadingPage'
import { ProviderButton } from './paymentPage/ProviderButton'
import {
  createNewRegistration,
  newRegistrationAtom,
  readStoredIdToken,
  registrationAtom,
  useConfirmedEvent,
} from './state'

export const loader = ({ params, request }: { params: Params<string>; request: Request }) => {
  const createPaymentWrap = async () => {
    if (params.id && params.registrationId) {
      try {
        return await createPayment(
          params.id,
          params.registrationId,
          params.editToken,
          readStoredIdToken(),
          request.signal
        )
      } catch (err) {
        // eat 403 & 404
        if (err instanceof APIError && (err.status === 403 || err.status === 404)) {
          return { response: undefined, status: err.status }
        }

        throw err
      }
    }
    return { response: undefined, status: 0 }
  }
  return { response: createPaymentWrap() }
}

interface Props {
  readonly registrationId?: string
  readonly event?: PublicConfirmedEvent | null
  readonly registration?: Registration | null
  readonly response?: CreatePaymentResponse
  /** Paytrail's words when it refused the payment; empty when it gave none (KOE-1513). */
  readonly paytrailError?: string
  readonly responseStatus?: number
}

/** The payment line's statuses that leave nothing to pay on this page: the page says so instead. */
const NOTICE_STATUSES = new Set<PaymentPictureStatus>(['notCharged', 'refunded', 'waitingForPlace'])

const paymentErrorStatusKey = {
  403: 'paymentPage.error403',
  404: 'paymentPage.error404',
  409: 'paymentPage.error409',
  412: 'paymentPage.error412',
  500: 'paymentPage.error500',
} as const

export const PaymentPageWithData = ({
  registrationId,
  event,
  registration,
  response,
  paytrailError,
  responseStatus,
}: Props) => {
  const { t } = useTranslation()
  useRegistrationLanguage(registration)

  // A page with nothing but a sentence to show still has a name for a screen reader (KOE-1519).
  const renderMessage = (message: string) => (
    <>
      <HiddenPageTitle>{t('paymentPage.title')}</HiddenPageTitle>
      {message}
    </>
  )

  if (!event) {
    return renderMessage(t('error.eventNotFound'))
  }

  // A response without the payment picture says nothing of the payment: the page has no registration to show.
  if (!registration || !hasPaymentPicture(registration)) {
    return renderMessage(t('paymentPage.registrationNotFound', { registrationId }))
  }

  const renderNotice = (message: string) => (
    <Paper sx={{ p: 1, width: '100%' }} elevation={0}>
      <Grid
        sx={{
          flexGrow: 1,
          pl: 1,
        }}
      >
        <LinkButton sx={{ mb: 1, pl: 0 }} to={Path.registration(registration)} text={t('goBack')} />
        {/* A notice is a sentence, often an error, not the page's name: a screen reader is given the
            page's title and then the notice, which keeps the size it had (KOE-1506). */}
        <HiddenPageTitle>{t('paymentPage.title')}</HiddenPageTitle>
        <Typography variant="h2" component="p">
          {message}
        </Typography>
      </Grid>
      <Divider sx={{ my: 1 }} />
      <RegistrationDetails event={event} registration={registration} />
      <Divider sx={{ my: 1 }} />
      <PaymentDetails event={event} registration={registration} includePayable />
    </Paper>
  )

  // The notice says what the status line says (KOE-1526), whatever PaymentCreate answered: paying at
  // confirmation waits for a place, not for the confirmation; a fee that went back was refunded, not
  // paid; and a trial that is not confirmed charges nothing.
  const { status: paymentStatus } = registration.payment
  if (NOTICE_STATUSES.has(paymentStatus)) {
    return renderNotice(t(PAYMENT_STATUS_KEY[paymentStatus]))
  }

  if (responseStatus === 204) {
    return renderNotice(t('paymentPage.alreadyPaid'))
  }

  // Paytrail's refusal before the status branches: its status is Paytrail's, not this API's.
  if (paytrailError !== undefined) {
    return renderNotice(
      t('paymentPage.errorPaytrail', {
        error: paytrailErrorText(paytrailError) ?? t('audit.unknownError'),
        status: responseStatus,
      })
    )
  }

  if (responseStatus === 501) {
    const secretaryContact = printContactInfo(event.contactInfo?.secretary)
    return renderNotice(t('paymentPage.error501MerchantInactive', { contact: secretaryContact }))
  }

  const errorKey = responseStatus
    ? paymentErrorStatusKey[responseStatus as keyof typeof paymentErrorStatusKey]
    : undefined
  if (errorKey) {
    return renderNotice(t(errorKey))
  }

  if (!response?.groups) {
    return renderMessage(t('error.somethingWentWrong'))
  }

  return (
    <Paper sx={{ p: 1, width: '100%' }} elevation={0}>
      <Grid
        sx={{
          flexGrow: 1,
          pl: 1,
        }}
      >
        <LinkButton sx={{ mb: 1, pl: 0 }} to={Path.registration(registration)} text={t('goBack')} />
        <Typography variant="h2" component="h1">
          {t('paymentPage.choosePaymentMethod')}
        </Typography>
        <Typography variant="caption">
          {/** biome-ignore lint/security/noDangerouslySetInnerHtml: yolo */}
          <span dangerouslySetInnerHTML={{ __html: response.terms }} />
        </Typography>
      </Grid>

      {response.groups.map((group) => (
        <Paper key={group.id} sx={{ m: 1, p: 1 }} elevation={0}>
          <Typography variant="h3" component="h2">
            {group.name}
          </Typography>
          <Grid container spacing={1}>
            {response.providers
              .filter((provider) => provider.group === group.id)
              .map((provider, index) => (
                <Grid
                  key={`${provider.id}${
                    // biome-ignore lint/suspicious/noArrayIndexKey: all good
                    index
                  }`}
                >
                  <ProviderButton provider={provider} />
                </Grid>
              ))}
          </Grid>
        </Paper>
      ))}

      <Divider sx={{ my: 1 }} />
      <RegistrationDetails event={event} registration={registration} />
      <Divider sx={{ my: 1 }} />
      <PaymentDetails event={event} registration={registration} includePayable />
    </Paper>
  )
}

export function Component() {
  const { editToken, id, registrationId } = useParams()
  const event = useConfirmedEvent(id)
  const registration = useAtomValue(registrationAtom(`${id ?? ''}:${registrationId ?? ''}:${editToken ?? ''}`))
  const data: { response: Promise<CreatePaymentResult> } = useLoaderData()
  const setRegistration = useSetAtom(newRegistrationAtom)
  const resetRegistration = useCallback(() => setRegistration(createNewRegistration()), [setRegistration])

  useEffect(() => {
    // Reset the registration form here, to avoid flashing page.
    resetRegistration()
  }, [
    // Reset the registration form here, to avoid flashing page.
    resetRegistration,
  ])

  return (
    <Suspense fallback={<LoadingPage />}>
      {event === undefined ? (
        // Still loading. A `null` event or registration is a known miss and must render its
        // message below — not spin forever (KOE-1262); the registration atom suspends while
        // loading, so by here it has resolved.
        <LoadingPage />
      ) : (
        <Await resolve={data.response} errorElement={<ErrorInfo />}>
          {(response) => (
            <PaymentPageWithData
              registrationId={registrationId}
              event={event}
              registration={registration}
              response={response?.response}
              paytrailError={response?.paytrailError}
              responseStatus={response?.status}
            />
          )}
        </Await>
      )}
    </Suspense>
  )
}

Component.displayName = 'PaymentPage'
