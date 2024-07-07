import type { Params } from 'react-router-dom'

import { Suspense } from 'react'
import { Await, defer, useLoaderData } from 'react-router-dom'
import Stack from '@mui/material/Stack'

import { getEvent } from '../api/event'
import { getRegistration, putRegistration } from '../api/registration'
import { Path } from '../routeConfig'

import LinkButton from './components/LinkButton'
import { LoadingPage } from './LoadingPage'

const redirectLoader = async (id?: string, registrationId?: string, signal?: AbortSignal): Promise<string> => {
  if (!id || !registrationId) return Path.home

  const [event, registration] = await Promise.all([
    getEvent(id, signal),
    getRegistration(id, registrationId, undefined, signal),
  ]).catch((e) => {
    console.log(e)
    return []
  })

  if (!event || !registration) return Path.home

  if (registration.invitationAttachment) {
    if (!registration.invitationRead) {
      registration.invitationRead = true
      await putRegistration(registration, undefined, signal)
    }
    return Path.invitationAttachment(registration)
  }
  return Path.registration(registration)
}

export const loader = async ({ params, request }: { params: Params<string>; request: Request }) => {
  const { id, registrationId } = params

  return defer({
    redirect: redirectLoader(id, registrationId, request.signal),
  })
}

export const Component = () => {
  const data = useLoaderData() as { redirect: Promise<string> }

  return (
    <Suspense fallback={<LoadingPage />}>
      <Await resolve={data.redirect} errorElement={<div>Koekutsun avaaminen epäonnistui</div>}>
        {(url) => (
          <>
            <Stack alignItems="end">
              <LinkButton download="kutsu.pdf" to={url} text="Lataa koekutsu" />
            </Stack>
            <iframe src={url} style={{ width: '100%', height: 'calc(100vh - 40px)' }}></iframe>
          </>
        )}
      </Await>
    </Suspense>
  )
}
