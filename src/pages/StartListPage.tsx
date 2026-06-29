import type { PublicRegistration } from '../types/Registration'
import Box from '@mui/material/Box'
import { type Params, useLoaderData, useParams } from 'react-router'
import { getStartList } from '../api/registration'
import { isStartListAvailable } from '../lib/event'
import { useConfirmedEvent } from './recoil'
import { EventHeader } from './startListPage/EventHeader'
import { ParticipantList } from './startListPage/ParticipantList'

export const startListLoader = async ({ params }: { params: Params<string> }) =>
  params.id ? getStartList(params.id) : []

export const StartListPage = () => {
  const { id } = useParams()
  const event = useConfirmedEvent(id)
  const participants: PublicRegistration[] = useLoaderData()
  const now = new Date()

  if (!event) {
    return <>Tapahtumaa {id} ei löydy.</>
  }

  if (!isStartListAvailable(event)) {
    return <>Starttilistaa ei ole saatavilla tälle tapahtumalle</>
  }

  return (
    <Box p={1}>
      <EventHeader event={event} now={now} />
      <ParticipantList participants={participants} event={event} />
    </Box>
  )
}
