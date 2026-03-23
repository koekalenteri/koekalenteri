import type { Params } from 'react-router'
import type { CreatePaymentResponse, PublicConfirmedEvent, Registration } from '../types'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Await, useLoaderData, useParams } from 'react-router'
import { useRecoilState, useRecoilValueLoadable, useResetRecoilState } from 'recoil'
import { APIError } from '../api/http'
import { createPayment } from '../api/payment'
import { printContactInfo } from '../lib/utils'
import { Path } from '../routeConfig'
import { ErrorInfo } from './components/ErrorInfo'
import LinkButton from './components/LinkButton'
import { PaymentDetails } from './components/PaymentDetails'
import { RegistrationDetails } from './components/RegistrationDetails'
import { LoadingPage } from './LoadingPage'
import { ProviderButton } from './paymentPage/ProviderButton'
import { confirmedEventSelector, languageAtom, newRegistrationAtom, registrationSelector } from './recoil'

export const loader = async ({ params }: { params: Params<string> }) => {
  const createPaymentWrap = async () => {
    if (params.id && params.registrationId) {
      try {
        return await createPayment(params.id, params.registrationId)
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
  readonly id?: string
  readonly registrationId?: string
  readonly event?: PublicConfirmedEvent | null
  readonly registration?: Registration | null
  readonly response?: CreatePaymentResponse
  readonly responseStatus?: number
}

const paymentErrorStatusKey = {
  403: 'paymentPage.error403',
  404: 'paymentPage.error404',
  409: 'paymentPage.error409',
  412: 'paymentPage.error412',
  500: 'paymentPage.error500',
} as const

export const PaymentPageWithData = ({ id, registrationId, event, registration, response, responseStatus }: Props) => {
  const [language, setLanguage] = useRecoilState(languageAtom)
  const { t } = useTranslation()

  useEffect(() => {
    if (registration && language !== registration.language) {
      setLanguage(registration.language)
    }
  }, [language, registration?.language, registration, setLanguage])

  if (!event) {
    return <>{t('paymentPage.eventNotFound', { id })}</>
  }

  if (!registration) {
    return <>{t('paymentPage.registrationNotFound', { registrationId })}</>
  }

  const renderNotice = (message: string) => (
    <Paper sx={{ p: 1, width: '100%' }} elevation={0}>
      <Grid sx={{ pl: 1 }} flexGrow={1}>
        <LinkButton sx={{ mb: 1, pl: 0 }} to={Path.registration(registration)} text={t('goBack')} />
        <Typography variant="h5">{message}</Typography>
      </Grid>
      <Divider sx={{ my: 1 }} />
      <RegistrationDetails event={event} registration={registration} />
      <Divider sx={{ my: 1 }} />
      <PaymentDetails event={event} registration={registration} includePayable />
    </Paper>
  )

  // If payment is after confirmation but registration is not confirmed yet, show message
  if (event.paymentTime === 'confirmation' && !registration.confirmed) {
    return renderNotice(t('paymentStatus.waitingForConfirmation'))
  }

  if (responseStatus === 204) {
    return renderNotice(t('paymentPage.alreadyPaid'))
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
    return <>{t('paymentPage.somethingWentWrong')}</>
  }

  return (
    <Paper sx={{ p: 1, width: '100%' }} elevation={0}>
      <Grid sx={{ pl: 1 }} flexGrow={1}>
        <LinkButton sx={{ mb: 1, pl: 0 }} to={Path.registration(registration)} text={t('goBack')} />
        <Typography variant="h5">{t('paymentPage.choosePaymentMethod')}</Typography>
        <Typography variant="caption">
          {/** biome-ignore lint/security/noDangerouslySetInnerHtml: yolo */}
          <span dangerouslySetInnerHTML={{ __html: response.terms }} />
        </Typography>
      </Grid>

      {response.groups.map((group) => (
        <Paper key={group.id} sx={{ m: 1, p: 1 }} elevation={0}>
          <Typography variant="h6">{group.name}</Typography>
          <Grid container spacing={1}>
            {response.providers
              .filter((provider) => provider.group === group.id)
              .map((provider, index) => (
                <Grid key={`${provider.id}${index}`}>
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
  const { id, registrationId } = useParams()
  const eventLoadable = useRecoilValueLoadable(confirmedEventSelector(id))
  const registrationLoadable = useRecoilValueLoadable(registrationSelector(`${id ?? ''}:${registrationId ?? ''}`))
  const data: { response: Promise<{ response?: CreatePaymentResponse; status: number }> } = useLoaderData()
  const resetRegistration = useResetRecoilState(newRegistrationAtom)

  const loadingEventOrRegistration = eventLoadable.state === 'loading' || registrationLoadable.state === 'loading'
  const event = eventLoadable.state === 'hasValue' ? eventLoadable.contents : null
  const registration = registrationLoadable.state === 'hasValue' ? registrationLoadable.contents : null

  useEffect(() => {
    // Reset the registration form here, to avoid flashing page.
    resetRegistration()
  }, [
    // Reset the registration form here, to avoid flashing page.
    resetRegistration,
  ])

  return (
    <Suspense fallback={<LoadingPage />}>
      {loadingEventOrRegistration ? (
        <LoadingPage />
      ) : (
        <Await resolve={data.response} errorElement={<ErrorInfo />}>
          {(response) => (
            <PaymentPageWithData
              id={id}
              registrationId={registrationId}
              event={event}
              registration={registration}
              response={response?.response}
              responseStatus={response?.status}
            />
          )}
        </Await>
      )}
    </Suspense>
  )
}

Component.displayName = 'PaymentPage'
