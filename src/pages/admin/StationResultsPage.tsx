import type { EventResultSubmission } from '../../api/registration'
import type { StationTurn, StationTurnOp } from '../../types'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useAtomValue } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { putEventResults } from '../../api/registration'
import { getStationLink, putStationTurn } from '../../api/station'
import { isScorableRegistration } from '../../lib/registration'
import { Path } from '../../routeConfig'
import { idTokenAtom } from '../state'
import EventNotFound from './components/EventNotFound'
import { StationScoring } from './eventResultsPage/StationScoring'
import { adminConfirmedEventAtom, adminEventRegistrationsAtom, useAdminEventActions } from './state'

/**
 * The event secretary's view of one post: `StationScoring` over the admin data, plus the controls for
 * the tokenized link a station secretary without an account scores through (KOE-1258).
 */
export default function StationResultsPage() {
  const { t } = useTranslation()
  const { id: eventId = '', stationId = '' } = useParams()
  const token = useAtomValue(idTokenAtom)
  const event = useAtomValue(adminConfirmedEventAtom(eventId))
  const registrations = useAtomValue(adminEventRegistrationsAtom(eventId))
  const eventActions = useAdminEventActions()

  const station = event?.stations?.find((item) => item.id === stationId)
  const scorable = useMemo(() => registrations.filter(isScorableRegistration), [registrations])

  const handleSave = useCallback(
    (submission: EventResultSubmission) => putEventResults(eventId, [submission], token ?? ''),
    [eventId, token]
  )

  // The response is the freshest timeline until the WebSocket patch catches the event atom up; each
  // save remembers which atom value it was based on, so a fresher patch takes over by itself.
  const [savedTurns, setSavedTurns] = useState<{ base: StationTurn[] | undefined; turns: StationTurn[] }>()
  const eventTurns = event?.turns
  const handleTurn = useCallback(
    async (op: StationTurnOp) => {
      const response = await putStationTurn(eventId, { ...op, stationId }, token ?? '')
      setSavedTurns({ base: eventTurns, turns: response.turns })
    },
    [eventId, eventTurns, stationId, token]
  )

  const handleCopyLink = useCallback(async () => {
    const { token: linkToken } = await getStationLink(eventId, stationId, token ?? '')
    await navigator.clipboard.writeText(
      `${globalThis.location.origin}${Path.stationEntry(eventId, stationId, linkToken)}`
    )
    enqueueSnackbar(t('results.stationLinkCopied'), { variant: 'success' })
  }, [eventId, stationId, t, token])

  // Bumping the version invalidates every link handed out; the next copy serves a fresh one.
  const handleRevokeLink = useCallback(async () => {
    if (!event) return
    const stations = event.stations?.map((item) =>
      item.id === stationId ? { ...item, tokenVersion: (item.tokenVersion ?? 1) + 1 } : item
    )
    await eventActions.save({ ...event, stations })
    enqueueSnackbar(t('results.stationLinkRevoked'), { variant: 'success' })
  }, [event, eventActions, stationId, t])

  if (!event?.id || !station) return <EventNotFound />

  const subtitle = `${event.name || event.eventType}${event.kcId ? ` · ${t('event.kcId')} ${event.kcId}` : ''}`

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}>
      <Stack direction="row" justifyContent="flex-end" spacing={1} sx={{ pb: 1 }}>
        <Button onClick={handleRevokeLink} size="small">
          {t('results.revokeStationLink')}
        </Button>
        <Button onClick={handleCopyLink} size="small" variant="outlined">
          {t('results.copyStationLink')}
        </Button>
      </Stack>
      <StationScoring
        classes={event.classes}
        eventType={event.eventType}
        onSave={handleSave}
        onTurn={handleTurn}
        registrations={scorable}
        station={station}
        subtitle={subtitle}
        turns={(savedTurns && savedTurns.base === event.turns ? savedTurns.turns : event.turns) ?? []}
      />
    </Box>
  )
}
