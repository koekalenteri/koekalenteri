import type { Params } from 'react-router-dom'
import type { CreatePaymentResponse, PublicDogEvent, Registration } from '../types'

import { Suspense } from 'react'
import { Await, defer, Navigate, useLoaderData, useParams } from 'react-router-dom'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useRecoilValue } from 'recoil'

import { APIError } from '../api/http'
import { createPayment } from '../api/payment'
import { Path } from '../routeConfig'

import { ErrorInfo } from './components/ErrorInfo'
import { ProviderButton } from './paymentPage/ProviderButton'
import { LoadingPage } from './LoadingPage'
import { confirmedEventSelector, registrationSelector } from './recoil'

export const paymentLoader = async ({ params }: { params: Params<string> }) => {
  const createPaymentWrap = async () => {
    if (params.id && params.registrationId) {
      try {
        const result = await createPayment(params.id, params.registrationId)

        return result ? result : null
      } catch (err) {
        // eat 404
        if (err instanceof APIError && err.status === 404) return null

        throw err
      }
    }
    return {}
  }
  return defer({ response: createPaymentWrap() })
}

interface Props {
  readonly id?: string
  readonly registrationId?: string
  readonly event?: PublicDogEvent | null
  readonly registration?: Registration | null
  readonly response?: CreatePaymentResponse
}

const PaymentPageWithData = ({ id, registrationId, event, registration, response }: Props) => {
  if (!event) {
    return <>Tapahtumaa {id} ei löydy.</>
  }
  if (!registration) {
    return <>Ilmoittautumista {registrationId} ei löydy.</>
  }

  if (registration.paymentStatus === 'SUCCESS') {
    return <Navigate to={Path.registration(registration)} replace />
  }

  if (!response?.groups) {
    return <>Jotakin meni pieleen</>
  }

  return (
    <Paper sx={{ p: 1, width: '100%' }} elevation={0}>
      <Typography variant="h5">Valitse maksutapa</Typography>
      <Typography variant="caption">
        <span dangerouslySetInnerHTML={{ __html: response.terms }} />
      </Typography>

      {response.groups.map((group) => (
        <Paper key={group.id} sx={{ p: 1, m: 1 }} elevation={0}>
          <Typography variant="h6">{group.name}</Typography>
          <Grid container spacing={1}>
            {response.providers
              .filter((provider) => provider.group === group.id)
              .map((provider, index) => (
                <Grid item key={provider.id + index}>
                  <ProviderButton provider={provider} />
                </Grid>
              ))}
          </Grid>
        </Paper>
      ))}
    </Paper>
  )
}

export const PaymentPage = () => {
  const { id, registrationId } = useParams()
  const event = useRecoilValue(confirmedEventSelector(id))
  const registration = useRecoilValue(registrationSelector(`${id ?? ''}:${registrationId ?? ''}`))
  const data = useLoaderData() as { response: Promise<CreatePaymentResponse | undefined> }

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
