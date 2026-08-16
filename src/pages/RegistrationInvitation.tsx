import type { Params } from 'react-router'
import type { DogEvent, Registration } from '../types'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import i18n from 'i18next'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Await, Navigate, useLoaderData } from 'react-router'
import { getEvent } from '../api/event'
import { getRegistration, patchRegistration } from '../api/registration'
import { invitationAttachmentFileName } from '../lib/fileName'
import { createPatchOperations } from '../lib/patch'
import { getInvitationReadStatus } from '../lib/registration'
import { Path } from '../routeConfig'
import LinkButton from './components/LinkButton'
import { LoadingPage } from './LoadingPage'

interface DeferredData {
  url?: string
  event: DogEvent
  registration: Registration
}

/**
 * exported for tests
 */
export const deferredLoader = async (
  id?: string,
  registrationId?: string,
  signal?: AbortSignal,
  editToken?: string
): Promise<DeferredData> => {
  if (!id || !registrationId) throw new Error('invalid params')

  const [event, registration] = await Promise.all([
    getEvent(id, signal),
    getRegistration(id, registrationId, editToken, signal),
  ]).catch((e) => {
    console.log(e)
    return []
  })

  if (!event || !registration) throw new Error('not found')

  await i18n.changeLanguage(registration.language)

  if (getInvitationReadStatus(registration) !== 'read-latest') {
    const updatedRegistration = { ...registration, invitationRead: true }
    await patchRegistration(
      {
        eventId: registration.eventId,
        id: registration.id,
        operations: createPatchOperations(registration, updatedRegistration),
      },
      undefined,
      signal
    )
    registration.invitationRead = true
  }

  if (registration.invitationAttachment) {
    return { event, registration, url: Path.invitationAttachment(registration) }
  }

  return { event, registration }
}

export const loader = async ({ params, request }: { params: Params<string>; request: Request }) => {
  const { editToken, id, registrationId } = params

  return {
    data: deferredLoader(id, registrationId, request.signal, editToken),
  }
}

export const Component = () => {
  const loaderData: { data: Promise<DeferredData> } = useLoaderData()
  const { t } = useTranslation()

  return (
    <Suspense fallback={<LoadingPage />}>
      <Await resolve={loaderData.data} errorElement={<div>{t('invitation.openingFailed')}</div>}>
        {({ url, event, registration }: DeferredData) => {
          if (!url) return <Navigate replace to={Path.registration(registration)} />

          return (
            <main style={{ padding: '8px' }}>
              <Paper sx={{ p: 1 }}>
                <Typography variant="caption">{t('invitation.event')}</Typography>
                <Typography>
                  {event.eventType} {t('dateFormat.datespan', { end: event.endDate, start: event.startDate })}{' '}
                  {event.location} ({event.name})
                </Typography>
                <Typography variant="caption">{t('invitation.registeredDog')}</Typography>
                <Typography>
                  {registration.dog.titles} {registration.dog.regNo} {registration.dog.name}
                </Typography>
                <Typography variant="caption">{t('invitation.handler')}</Typography>
                <Typography>{registration.handler?.name}</Typography>
              </Paper>
              {registration.invitationAttachmentUpdatedAt && (
                <Typography color="text.secondary" sx={{ pt: 1 }} variant="caption">
                  {t('invitation.attachmentUpdated', { date: registration.invitationAttachmentUpdatedAt })}
                </Typography>
              )}
              <Stack alignItems="start" sx={{ py: 1 }} gap={1} direction="row">
                <LinkButton target="_blank" to={url} text={t('invitation.open')} />
                <LinkButton
                  download={invitationAttachmentFileName(registration)}
                  to={`${url}?dl`}
                  text={t('invitation.download')}
                />
              </Stack>
            </main>
          )
        }}
      </Await>
    </Suspense>
  )
}
