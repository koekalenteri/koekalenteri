import type { EventResultSubmission } from '../../api/registration'
import type { EventStation, StationTurn, StationTurnOp } from '../../types'
import ArrowBack from '@mui/icons-material/ArrowBack'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useAtomValue } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { putEventResults } from '../../api/registration'
import { getStationLink, putStationTurn } from '../../api/station'
import { useEventSubscription } from '../../hooks/useEventSubscription'
import { liveFormat, resolveStation } from '../../lib/liveFormat'
import { isScorableRegistration } from '../../lib/registration'
import { Path } from '../../routeConfig'
import { idTokenAtom } from '../state'
import EventNotFound from './components/EventNotFound'
import { StationPhasesEditor } from './eventResultsPage/StationPhasesEditor'
import { StationScoring } from './eventResultsPage/StationScoring'
import { adminConfirmedEventAtom, adminEventRegistrationsAtom, useAdminEventActions } from './state'
import { useStoreEventResults } from './state/registrations/actions'

/**
 * The event secretary's view of one post: `StationScoring` over the admin data, plus the controls for
 * the live entry link a judge's secretary without an account scores through (KOE-1258).
 */
export default function StationResultsPage() {
  const { t } = useTranslation()
  const { id: eventId = '', stationId = '' } = useParams()
  const token = useAtomValue(idTokenAtom)
  const event = useAtomValue(adminConfirmedEventAtom(eventId))
  const registrations = useAtomValue(adminEventRegistrationsAtom(eventId))
  const eventActions = useAdminEventActions()
  const storeResults = useStoreEventResults(eventId)
  // The other posts' scores, the token link's saves and its turns arrive over the socket only while
  // this page is subscribed to the event.
  useEventSubscription(eventId)

  // The event's own post, or the implicit single post of a format that lays none out (NOME-B, NOU).
  const station = event && resolveStation(event, stationId)
  const scorable = useMemo(() => registrations.filter(isScorableRegistration), [registrations])

  // What came back is the stored truth for that dog: folding it in is what marks the dog as done in
  // the queue, and what keeps the post from scoring it twice.
  const handleSave = useCallback(
    async (submission: EventResultSubmission) => {
      const response = await putEventResults(eventId, [submission], token ?? '')
      await storeResults([...response.saved, ...response.unchanged])
      return response
    },
    [eventId, storeResults, token]
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
    await navigator.clipboard.writeText(`${globalThis.location.origin}${Path.liveEntry(eventId, stationId, linkToken)}`)
    enqueueSnackbar(t('results.liveEntryLinkCopied'), { variant: 'success' })
  }, [eventId, stationId, t, token])

  // A change to the post is written onto the event. An implicit post has not been written anywhere
  // until now, so the first change is what puts it there.
  const saveStation = useCallback(
    async (changes: Partial<EventStation>) => {
      if (!event || !station) return
      const changed = { ...station, ...changes }
      const stations = event.stations?.some((item) => item.id === station.id)
        ? event.stations.map((item) => (item.id === station.id ? changed : item))
        : [...(event.stations ?? []), changed]
      await eventActions.save({ ...event, stations })
    },
    [event, eventActions, station]
  )

  // Bumping the version invalidates every link handed out; the next copy serves a fresh one.
  const handleRevokeLink = useCallback(async () => {
    if (!station) return
    await saveStation({ tokenVersion: (station.tokenVersion ?? 1) + 1 })
    enqueueSnackbar(t('results.liveEntryLinkRevoked'), { variant: 'success' })
  }, [saveStation, station, t])

  if (!event?.id || !station) return <EventNotFound />

  const subtitle = `${event.name || event.eventType}${event.kcId ? ` · ${t('event.kcId')} ${event.kcId}` : ''}`
  // A format whose phases are the post's own gets them written here, at the post, on the day.
  const format = liveFormat(event.eventType)
  const ownPhases = format.tasks === 'phases' && !format.phases

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'center',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          pb: 1,
        }}
      >
        {/* The event secretary came from the results page and goes back there; the token link has no such page. */}
        <Button
          component={Link}
          size="small"
          startIcon={<ArrowBack fontSize="small" />}
          sx={{ ml: -1 }}
          to={Path.admin.results(eventId)}
        >
          {t('results.backToResults')}
        </Button>
        {ownPhases && (
          <StationPhasesEditor onSave={(phases) => saveStation({ phases })} phases={station.phases ?? []} />
        )}
        <Box
          sx={{
            flexGrow: 1,
          }}
        />
        <Button onClick={handleRevokeLink} size="small">
          {t('results.revokeLiveEntryLink')}
        </Button>
        <Button onClick={handleCopyLink} size="small" variant="outlined">
          {t('results.copyLiveEntryLink')}
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
