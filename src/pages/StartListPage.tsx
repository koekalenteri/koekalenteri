import type { Params } from 'react-router'
import type { PublicRegistration } from '../types/Registration'
import Box from '@mui/material/Box'
import { useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLoaderData, useParams } from 'react-router'
import { getStartList } from '../api/registration'
import { usePublicStartListSubscription } from '../hooks/usePublicStartListSubscription'
import { isStartListAvailable } from '../lib/event'
import { liveViewEnabled } from '../lib/features'
import LoadingIndicator from './components/LoadingIndicator'
import { EventHeader } from './startListPage/EventHeader'
import { LiveStatus } from './startListPage/LiveStatus'
import { ParticipantList } from './startListPage/ParticipantList'
import { useConfirmedEvent, userAtom } from './state'

const userValueAtom = unwrap(userAtom)

export const startListLoader = async ({ params }: { params: Params<string> }) =>
  params.id ? getStartList(params.id) : []

export const StartListPage = () => {
  const { t } = useTranslation()
  const { id } = useParams()
  const event = useConfirmedEvent(id)
  const user = useAtomValue(userValueAtom)
  const loaded: PublicRegistration[] = useLoaderData()
  const [participants, setParticipants] = useState(loaded)
  useEffect(() => setParticipants(loaded), [loaded])

  // The rows arrive over the socket as the server composes them, so publishing the numbers, hiding
  // them again or cancelling a dog reaches an open page without fetching anything (KOE-1358). A
  // list too large for one message comes as a request to fetch it instead.
  const handleLiveParticipants = useCallback(
    (fresh: PublicRegistration[] | undefined) => {
      if (fresh) {
        setParticipants(fresh)
        return
      }
      if (!id) return
      getStartList(id)
        .then((fetched) => setParticipants(fetched))
        .catch(() => {})
    },
    [id]
  )
  usePublicStartListSubscription(id, handleLiveParticipants)

  const now = new Date()

  if (event === undefined) {
    return <LoadingIndicator />
  }

  if (event === null) {
    return <>{t('error.eventNotFound')}</>
  }

  if (!isStartListAvailable(event)) {
    return <>{t('error.startListNotAvailable')}</>
  }

  const currentUser = user ?? null
  const showExportActions = currentUser?.admin === true || !!currentUser?.roles?.[event.organizer.id]

  return (
    <Box p={1}>
      <EventHeader event={event} now={now} />
      {liveViewEnabled && <LiveStatus event={event} participants={participants} />}
      <ParticipantList participants={participants} event={event} showExportActions={showExportActions} />
    </Box>
  )
}
