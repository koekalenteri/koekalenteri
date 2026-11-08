import type { PublicRegistration } from '../../types/Registration'
import Box from '@mui/material/Box'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { getStartListPreview } from '../../api/registration'
import { AdminAccessGuard } from '../components/AdminAccessGuard'
import LoadingIndicator from '../components/LoadingIndicator'
import { EventHeader } from '../startListPage/EventHeader'
import { ParticipantList } from '../startListPage/ParticipantList'
import { useConfirmedEvent, validIdTokenAtom } from '../state'
import { useAdminEventScope } from './state/eventScope'

export default function StartListPreviewPage() {
  return (
    <AdminAccessGuard>
      <StartListPreview />
    </AdminAccessGuard>
  )
}

function StartListPreview() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  useAdminEventScope(id)
  const event = useConfirmedEvent(id)
  const token = useAtomValue(validIdTokenAtom)
  const [error, setError] = useState<unknown>()
  const [participants, setParticipants] = useState<PublicRegistration[]>()

  useEffect(() => {
    if (!token || !id) return

    const controller = new AbortController()
    void getStartListPreview(id, token, controller.signal)
      .then(setParticipants)
      .catch((requestError: unknown) => {
        if (!controller.signal.aborted) setError(requestError)
      })
    return () => controller.abort()
  }, [id, token])

  if (error) throw error

  if (event === undefined || participants === undefined) {
    return <LoadingIndicator />
  }

  if (event === null) {
    return <>{t('error.eventNotFound')}</>
  }

  return (
    <Box
      sx={{
        p: 1,
      }}
    >
      <EventHeader event={event} now={new Date()} />
      <ParticipantList participants={participants} event={event} includeUnpublished showExportActions />
    </Box>
  )
}
