import type { CreatePaymentResponse } from 'koekalenteri-shared/model'
import type { Params } from 'react-router-dom'

import { useLoaderData, useParams } from 'react-router-dom'
import Grid from '@mui/material/Grid'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import { useRecoilValue } from 'recoil'

import { createPayment } from '../api/payment'

import { ProviderButton } from './paymentPage/ProviderButton'
import { confirmedEventSelector, registrationSelector } from './recoil'

export const paymentLoader = async ({ params }: { params: Params<string> }) =>
  params.id && params.registrationId ? createPayment(params.id, params.registrationId) : {}

export const PaymentPage = () => {
  const { id, registrationId } = useParams()
  const event = useRecoilValue(confirmedEventSelector(id))
  const registration = useRecoilValue(registrationSelector(`${id ?? ''}:${registrationId ?? ''}`))
  const response = useLoaderData() as CreatePaymentResponse

  if (!event || !registration) {
    return <>Tapahtumaa {id} ei löydy.</>
  }

  if (!response) {
    return <>Jotakin meni pieleen</>
  }

  return (
    <Paper sx={{ p: 1, width: '100%' }} elevation={0}>
      <Typography variant="h5">Valitse maksutapa</Typography>
      <Typography variant="caption">
        <span dangerouslySetInnerHTML={{ __html: response.terms }} />
      </Typography>

      {response.groups.map((group) => (
        <Paper sx={{ p: 1, m: 1 }} elevation={0}>
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
