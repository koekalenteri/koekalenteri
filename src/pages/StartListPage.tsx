import type { PublicRegistration } from '../types/Registration'
import Box from '@mui/material/Box'
import { useTranslation } from 'react-i18next'
import { type Params, useLoaderData, useParams } from 'react-router'
import { getStartList } from '../api/registration'
import { isStartListAvailable } from '../lib/event'
import LoadingIndicator from './components/LoadingIndicator'
import { useConfirmedEvent } from './recoil'
import { EventHeader } from './startListPage/EventHeader'
import { ParticipantList } from './startListPage/ParticipantList'

export const startListLoader = async ({ params }: { params: Params<string> }) =>
  params.id ? getStartList(params.id) : []

export const StartListPage = () => {
  const { t } = useTranslation()
  const { id } = useParams()
  const event = useConfirmedEvent(id)
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

  return (
    <Box p={1}>
      <EventHeader event={event} now={now} />
      <ParticipantList participants={participants} event={event} />
    </Box>
  )
}
