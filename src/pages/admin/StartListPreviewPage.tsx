import type { PublicRegistration } from '../../types/Registration'
import Box from '@mui/material/Box'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { useRecoilValue } from 'recoil'
import { getStartListPreview } from '../../api/registration'
import LoadingIndicator from '../components/LoadingIndicator'
import { hasAdminAccessSelector, idTokenAtom, useConfirmedEvent, useUserActions } from '../recoil'
import { EventHeader } from '../startListPage/EventHeader'
import { ParticipantList } from '../startListPage/ParticipantList'

export default function StartListPreviewPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const actions = useUserActions()
  const event = useConfirmedEvent(id)
  const hasAccess = useRecoilValue(hasAdminAccessSelector)
  const token = useRecoilValue(idTokenAtom)
  const [error, setError] = useState<unknown>()
  const [participants, setParticipants] = useState<PublicRegistration[]>()

  useEffect(() => {
    if (!hasAccess) actions.login()
  }, [actions, hasAccess])

  useEffect(() => {
    if (!hasAccess || !token || !id) return

    const controller = new AbortController()
    void getStartListPreview(id, token, controller.signal).then(setParticipants).catch(setError)
    return () => controller.abort()
  }, [hasAccess, id, token])

  if (error) throw error

  if (!hasAccess || event === undefined || participants === undefined) {
    return <LoadingIndicator />
  }

  if (event === null) {
    return <>{t('error.eventNotFound')}</>
  }

  return (
    <Box p={1}>
      <EventHeader event={event} now={new Date()} />
      <ParticipantList participants={participants} event={event} includeUnpublished />
    </Box>
  )
}
