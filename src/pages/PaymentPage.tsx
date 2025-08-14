import type { Params } from 'react-router'
import type { CreatePaymentResponse, PublicConfirmedEvent, Registration } from '../types'

import { Suspense, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Await, Navigate, useLoaderData, useParams } from 'react-router'
import Divider from '@mui/material/Divider'
import Grid2 from '@mui/material/Grid2'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useRecoilValue, useResetRecoilState } from 'recoil'

import { APIError } from '../api/http'
import { createPayment } from '../api/payment'
import { Path } from '../routeConfig'

import { ErrorInfo } from './components/ErrorInfo'
import { PaymentDetails } from './components/PaymentDetails'
import { RegistrationDetails } from './components/RegistrationDetails'
import { ProviderButton } from './paymentPage/ProviderButton'
import { LoadingPage } from './LoadingPage'
import { confirmedEventSelector, newRegistrationAtom, registrationSelector } from './recoil'

/**
 * @lintignore
 */
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
  const { t } = useTranslation()
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
      <RegistrationDetails event={event} registration={registration} />
      <Divider sx={{ my: 1 }} />
      <PaymentDetails event={event} registration={registration} includePayable />
      <Divider sx={{ my: 1 }} />
      <Typography variant="h5">{t('paymentPage.choosePaymentMethod')}</Typography>
      <Typography variant="caption">
        <span dangerouslySetInnerHTML={{ __html: response.terms }} />
      </Typography>

      {response.groups.map((group) => (
        <Paper key={group.id} sx={{ p: 1, m: 1 }} elevation={0}>
          <Typography variant="h6">{group.name}</Typography>
          <Grid2 container spacing={1}>
            {response.providers
              .filter((provider) => provider.group === group.id)
              .map((provider, index) => (
                <Grid2 key={provider.id + index}>
                  <ProviderButton provider={provider} />
                </Grid2>
              ))}
          </Grid2>
        </Paper>
      ))}
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
