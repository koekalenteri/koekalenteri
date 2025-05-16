import type { Params } from 'react-router'
import type { PublicRegistration } from '../types/Registration'

import { useTranslation } from 'react-i18next'
import { useLoaderData, useParams } from 'react-router'
import Box from '@mui/material/Box'
import { useRecoilValue } from 'recoil'

import { getStartList } from '../api/registration'

import { EventHeader } from './startListPage/EventHeader'
import { ParticipantList } from './startListPage/ParticipantList'
import { confirmedEventSelector } from './recoil'

export const startListLoader = async ({ params }: { params: Params<string> }) =>
  params.id ? getStartList(params.id) : []

export const StartListPage = () => {
  const { t } = useTranslation()
  const { id } = useParams()
  const event = useRecoilValue(confirmedEventSelector(id))
  const participants: PublicRegistration[] = useLoaderData()
  const now = new Date()

  if (!event) {
    return <>Tapahtumaa {id} ei löydy.</>
  }

  if (!participants?.length) {
    return <>Starttilistaa ei ole saatavilla tälle tapahtumalle</>
  }

  return (
    <Box p={1}>
      <EventHeader event={event} now={now} />
      <ParticipantList participants={participants} event={event} />
    </Box>
  )
}
