import type { PublicConfirmedEvent, PublicStationTurn } from '../../types/Event'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getEvent } from '../../api/event'
import { isEventLive } from '../../lib/event'
import { liveFormat, livePhaseLabel, stationDogsAtOnce, stationPhases } from '../../lib/liveFormat'
import {
  completedGroupTurns,
  currentPhase,
  dogsThrough,
  isBreakTurn,
  isLiveNow,
  isWholeTurn,
  liveStationIds,
  openTurn,
  stationThroughput,
  turnElapsedMs,
  waitEstimate,
} from '../../lib/stationTurns'

const POLL_INTERVAL_MS = 60000
const CLOCK_TICK_MS = 30000

const minutes = (ms: number) => Math.max(0, Math.round(ms / 60000))

interface StationCardProps {
  readonly event: PublicConfirmedEvent
  readonly stationId: string
  readonly turns: readonly PublicStationTurn[]
  /** How many dogs are entered at all — what the queue at each post is counted down from. */
  readonly starters: number
  readonly single: boolean
}

/**
 * One post's card. Split out of the list because a post says several things at once — who is on it,
 * how fast it has been going, and how much of the queue is left — and each of them is conditional.
 */
const LiveStationCard = ({ event, stationId, turns, starters, single }: StationCardProps) => {
  const { t } = useTranslation()

  const station = event.stations?.find((item) => item.id === stationId)
  const format = liveFormat(event.eventType)
  const phases = stationPhases(event.eventType, station)
  const open = openTurn(turns, stationId)
  const completed = completedGroupTurns(turns, stationId)
  const throughput = stationThroughput(turns, stationId)
  const dogsAtOnce = stationDogsAtOnce(event.eventType, station)
  const through = dogsThrough(turns, stationId)
  const wait = waitEstimate(throughput, starters - through, dogsAtOnce, format.flow)
  // The last dog is through: the one thing left to say is when.
  const lastEnd = completed
    .map((turn) => new Date(turn.endedAt ?? turn.startedAt).valueOf())
    .reduce((a, b) => Math.max(a, b), 0)
  const allThrough = !open && starters > 0 && through >= starters && lastEnd > 0

  const phaseLabel = (key: string | undefined) => {
    const known = phases.find((item) => item.key === key)
    return known ? livePhaseLabel(known, t) : (key ?? '')
  }

  const dogLabel = (dog: PublicStationTurn['dogs'][number]) => {
    const name = dog.number ? `${dog.number} ${dog.name}`.trim() : dog.name
    return dog.mark ? `${name} (${t(`liveStatus.mark.${dog.mark}`)})` : name
  }

  const statusLine = () => {
    if (!open) {
      return allThrough
        ? t('liveStatus.allThrough', { time: t('dateFormat.time', { date: new Date(lastEnd) }) })
        : t('liveStatus.free')
    }
    const time = t('dateFormat.time', { date: new Date(open.startedAt) })
    if (isBreakTurn(open)) {
      return t('liveStatus.pauseSince', { label: t(`liveStatus.pause.${open.pause ?? 'other'}`), time })
    }
    const phase = currentPhase(open)
    if (isWholeTurn(open)) return t('liveStatus.pauseSince', { label: phaseLabel(phase), time })
    const named = phase === undefined ? '' : ` · ${phaseLabel(phase)}`
    const since = t('liveStatus.sinceMinutes', { minutes: minutes(turnElapsedMs(open)) })
    return `${open.dogs.map(dogLabel).join(', ')}${named} · ${since}`
  }

  return (
    <Paper sx={{ minWidth: 220, p: 1.5 }} variant="outlined">
      {/* A format with one post has nothing to call it; the section's own heading is enough. */}
      {!single && (
        <Typography
          variant="overline"
          sx={{
            color: 'text.secondary',
          }}
        >
          {t('liveStatus.station', { number: station?.number ?? stationId })}
        </Typography>
      )}
      <Typography sx={{ fontWeight: open && !isBreakTurn(open) ? 'bold' : undefined }} variant="body2">
        {statusLine()}
      </Typography>
      <Typography
        variant="caption"
        component="div"
        sx={{
          color: 'text.secondary',
        }}
      >
        {t('liveStatus.through', { count: through })}
        {throughput
          ? ` · ${t('liveStatus.throughput', {
              max: minutes(throughput.maxMs),
              mean: minutes(throughput.meanMs),
              min: minutes(throughput.minMs),
            })}`
          : ` · ${t('liveStatus.noEstimate')}`}
      </Typography>
      {/* The number most people actually want. A range, and never a promise — and withheld entirely
          where the whole entry walks the ground together, since minutes describe nothing there. */}
      {wait && (
        <Typography
          variant="caption"
          component="div"
          sx={{
            color: 'text.secondary',
          }}
        >
          {t('liveStatus.waitEstimate', {
            count: wait.groupsAhead,
            max: minutes(wait.maxMs),
            min: minutes(wait.minMs),
          })}
        </Typography>
      )}
    </Paper>
  )
}

/**
 * The live view of the trial day on the public start list page (KOE-1259): which dogs are at each
 * post right now, the current break, and how fast the queue is actually moving. The WebSocket keeps
 * it current; a polling fallback keeps it correct over the venue's own bad signal.
 */
export const LiveStatus = ({
  event,
  participants,
}: {
  readonly event: PublicConfirmedEvent
  /** The published start list, only to count how many dogs each post still has to get through. */
  readonly participants?: readonly { cancelled?: boolean }[]
}) => {
  const { t } = useTranslation()
  // Polled turns fill in when the socket is quiet. Each poll remembers which prop value it was based
  // on, so the moment a WebSocket patch delivers fresher turns the stale poll result steps aside.
  const [polled, setPolled] = useState<{
    base: PublicConfirmedEvent['liveTurns']
    turns: PublicConfirmedEvent['liveTurns']
  }>()
  const [, setTick] = useState(0)

  const eventTurns = event.liveTurns

  useEffect(() => {
    const timer = setInterval(() => {
      getEvent(event.id)
        .then((fresh) => setPolled({ base: eventTurns, turns: fresh?.liveTurns }))
        .catch(() => {})
    }, POLL_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [event.id, eventTurns])

  const turns = (polled && polled.base === eventTurns ? polled.turns : eventTurns) ?? []
  // The clock keeps ticking while anything is live, so the section also goes away on time.
  const hasOpen = isLiveNow(turns)
  useEffect(() => {
    if (!hasOpen) return
    const timer = setInterval(() => setTick((tick) => tick + 1), CLOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [hasOpen])

  // Nothing to show once the trial is over: with every class's results published, the page is the
  // results, and the last dog's finishing time has had its day. The same rule lights the calendar.
  if (!isEventLive({ ...event, liveTurns: turns })) return null

  const stationIds = liveStationIds(turns)
  // Every dog visits every post over the day, so the whole entry is the queue at each of them.
  const starters = (participants ?? []).filter((participant) => !participant.cancelled).length

  return (
    <Box
      sx={{
        my: 1,
      }}
    >
      <Typography variant="h6">{t('liveStatus.title')}</Typography>
      <Stack
        direction="row"
        useFlexGap
        sx={{
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        {stationIds.map((stationId) => (
          <LiveStationCard
            event={event}
            key={stationId}
            single={liveFormat(event.eventType).posts === 'one'}
            starters={starters}
            stationId={stationId}
            turns={turns}
          />
        ))}
      </Stack>
    </Box>
  )
}
