import type { Params } from 'react-router'
import type { PublicRegistration } from '../types/Registration'
import Box from '@mui/material/Box'
import { useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLoaderData, useParams } from 'react-router'
import { getStartList } from '../api/registration'
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

  // The event arrives live over the socket, the list does not: when the results (or another class's
  // start list) get published while the page is open, the list is fetched again so it shows them —
  // the event patch alone would only take the live section away and leave the old rows standing.
  const publication = JSON.stringify([event?.startListPublished ?? null, event?.resultsPublished ?? null])
  const seenPublication = useRef(publication)
  useEffect(() => {
    if (!id || seenPublication.current === publication) return
    seenPublication.current = publication
    const abort = new AbortController()
    getStartList(id, undefined, abort.signal)
      .then((fresh) => setParticipants(fresh))
      .catch(() => {})
    return () => abort.abort()
  }, [id, publication])

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
