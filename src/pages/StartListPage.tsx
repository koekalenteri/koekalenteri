import type { Params } from 'react-router'
import type { PublicRegistration } from '../types/Registration'
import Box from '@mui/material/Box'
import { useAtomValue } from 'jotai'
import { unwrap } from 'jotai/utils'
import { useTranslation } from 'react-i18next'
import { useLoaderData, useParams } from 'react-router'
import { getStartList } from '../api/registration'
import { isStartListAvailable } from '../lib/event'
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
  const participants: PublicRegistration[] = useLoaderData()
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
      <LiveStatus event={event} />
      <ParticipantList participants={participants} event={event} showExportActions={showExportActions} />
    </Box>
  )
}
