import type { Params } from 'react-router-dom'
import type { DogEvent, Registration } from '../types'

import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Await, defer, useLoaderData } from 'react-router-dom'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import { getEvent } from '../api/event'
import { getRegistration, putRegistration } from '../api/registration'
import { Path } from '../routeConfig'

import LinkButton from './components/LinkButton'
import { LoadingPage } from './LoadingPage'

interface DeferredData {
  url: string
  event: DogEvent
  registration: Registration
}

const deferredLoader = async (id?: string, registrationId?: string, signal?: AbortSignal): Promise<DeferredData> => {
  if (!id || !registrationId) throw new Error('invalid params')

  const [event, registration] = await Promise.all([
    getEvent(id, signal),
    getRegistration(id, registrationId, undefined, signal),
  ]).catch((e) => {
    console.log(e)
    return []
  })

  if (!event || !registration) throw new Error('not found')

  if (registration.invitationAttachment) {
    if (!registration.invitationRead) {
      registration.invitationRead = true
      await putRegistration(registration, undefined, signal)
    }
    return { url: Path.invitationAttachment(registration), event, registration }
  }

  throw new Error('no attachment')
}

export const loader = async ({ params, request }: { params: Params<string>; request: Request }) => {
  const { id, registrationId } = params

  return defer({
    data: deferredLoader(id, registrationId, request.signal),
  })
}

export const Component = () => {
  const loaderData = useLoaderData() as { data: Promise<DeferredData> }
  const { t } = useTranslation()

  return (
    <Suspense fallback={<LoadingPage />}>
      <Await resolve={loaderData.data} errorElement={<div>Koekutsun avaaminen epäonnistui</div>}>
        {({ url, event, registration }: DeferredData) => (
          <main style={{ padding: '8px' }}>
            <Paper sx={{ p: 1 }}>
              <Typography variant="caption">Koe</Typography>
              <Typography>
                {event.eventType} {t('dateFormat.datespan', { start: event.entryStartDate, end: event.entryEndDate })}{' '}
                {event.location} ({event.name})
              </Typography>
              <Typography variant="caption">Ilmoitettu koira</Typography>
              <Typography>
                {registration.dog.titles} {registration.dog.regNo} {registration.dog.name}
              </Typography>
              <Typography variant="caption">Ohjaaja</Typography>
              <Typography>{registration.handler.name}</Typography>
            </Paper>
            <Stack alignItems="start" sx={{ py: 1 }} gap={1} direction="row">
              <LinkButton target="_blank" to={url} text="Avaa koekutsu" />
              <LinkButton download="kutsu.pdf" to={`${url}?dl`} text="Lataa koekutsu" />
            </Stack>
          </main>
        )}
      </Await>
    </Suspense>
  )
}
