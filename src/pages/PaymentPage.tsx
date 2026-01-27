import type { Params } from 'react-router'
import type { CreatePaymentResponse, PublicConfirmedEvent, Registration } from '../types'

import { Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Await, Navigate, useLoaderData, useParams } from 'react-router'
import Divider from '@mui/material/Divider'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { APIError } from '../api/http'
import { createPayment } from '../api/payment'
import { Path } from '../routeConfig'

import { ErrorInfo } from './components/ErrorInfo'
import LinkButton from './components/LinkButton'
import { PaymentDetails } from './components/PaymentDetails'
import { RegistrationDetails } from './components/RegistrationDetails'
import { ProviderButton } from './paymentPage/ProviderButton'
import { LoadingPage } from './LoadingPage'
import { confirmedEventSelector, languageAtom, newRegistrationAtom, registrationSelector } from './recoil'

export const loader = async ({ params }: { params: Params<string> }) => {
  const createPaymentWrap = async () => {
    if (params.id && params.registrationId) {
      try {
        const result = await createPayment(params.id, params.registrationId)

        return result ?? null
      } catch (err) {
        // eat 404
        if (err instanceof APIError && err.status === 404) return null

        throw err
      }
    }
    return {}
  }
  return { response: createPaymentWrap() }
}

interface Props {
  readonly id?: string
  readonly registrationId?: string
  readonly event?: PublicConfirmedEvent | null
  readonly registration?: Registration | null
  readonly response?: CreatePaymentResponse
}

export const PaymentPageWithData = ({ id, registrationId, event, registration, response }: Props) => {
  const [language, setLanguage] = useRecoilState(languageAtom)
  const { t } = useTranslation()

  useEffect(() => {
    if (registration && language !== registration.language) {
      setLanguage(registration.language)
    }
  }, [language, registration?.language])

  if (!event) {
    return <>{t('paymentPage.eventNotFound', { id })}</>
  }

  if (!registration) {
    return <>{t('paymentPage.registrationNotFound', { registrationId })}</>
  }

  if (registration.paymentStatus === 'SUCCESS') {
    return <Navigate to={Path.registration(registration)} replace />
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
          <span dangerouslySetInnerHTML={{ __html: response.terms }} />
        </Typography>
      </Grid>

      {response.groups.map((group) => (
        <Paper key={group.id} sx={{ p: 1, m: 1 }} elevation={0}>
          <Typography variant="h6">{group.name}</Typography>
          <Grid container spacing={1}>
            {response.providers
              .filter((provider) => provider.group === group.id)
              .map((provider, index) => (
                <Grid key={provider.id + index}>
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
  const event = useRecoilValue(confirmedEventSelector(id))
  const registration = useRecoilValue(registrationSelector(`${id ?? ''}:${registrationId ?? ''}`))
  const data: { response: Promise<CreatePaymentResponse | undefined> } = useLoaderData()
  const resetRegistration = useResetRecoilState(newRegistrationAtom)

  useEffect(() => {
    // Reset the registration form here, to avoid flashing page.
    resetRegistration()
  }, [])

  return (
    <Suspense fallback={<LoadingPage />}>
      <Await resolve={data.response} errorElement={<ErrorInfo />}>
        {(response) => (
          <PaymentPageWithData
            id={id}
            registrationId={registrationId}
            event={event}
            registration={registration}
            response={response}
          />
        )}
      </Await>
    </Suspense>
  )
}

Component.displayName = 'PaymentPage'
