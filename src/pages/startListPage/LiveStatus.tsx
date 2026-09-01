import type { PublicConfirmedEvent, PublicStationTurn } from '../../types/Event'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getEvent } from '../../api/event'
import { liveFormat, stationDogsAtOnce } from '../../lib/liveFormat'
import {
  completedGroupTurns,
  dogsThrough,
  isBreakTurn,
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
  const open = openTurn(turns, stationId)
  const completed = completedGroupTurns(turns, stationId)
  const throughput = stationThroughput(turns, stationId)
  const wait = waitEstimate(
    throughput,
    starters - dogsThrough(turns, stationId),
    stationDogsAtOnce(event.eventType, station),
    format.flow
  )

  const dogLabel = (dog: PublicStationTurn['dogs'][number]) => {
    const name = dog.number ? `${dog.number} ${dog.name}`.trim() : dog.name
    return dog.mark ? `${name} (${t(`liveStatus.mark.${dog.mark}`)})` : name
  }

  const statusLine = () => {
    if (!open) return t('liveStatus.free')
    if (isBreakTurn(open)) {
      return t('liveStatus.pauseSince', {
        label: t(`liveStatus.pause.${open.pause ?? 'other'}`),
        time: t('dateFormat.time', { date: new Date(open.startedAt) }),
      })
    }
    const task = open.taskIndex === undefined ? '' : ` · ${t('liveStatus.task', { number: open.taskIndex + 1 })}`
    const since = t('liveStatus.sinceMinutes', { minutes: minutes(turnElapsedMs(open)) })
    return `${open.dogs.map(dogLabel).join(', ')}${task} · ${since}`
  }

  const title =
    station || !single ? t('liveStatus.station', { number: station?.number ?? stationId }) : t('liveStatus.title')

  return (
    <Paper sx={{ minWidth: 220, p: 1.5 }} variant="outlined">
      <Typography color="text.secondary" variant="overline">
        {title}
      </Typography>
      <Typography sx={{ fontWeight: open && !isBreakTurn(open) ? 'bold' : undefined }} variant="body2">
        {statusLine()}
      </Typography>
      <Typography color="text.secondary" variant="caption" component="div">
        {t('liveStatus.completed', { count: completed.length })}
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
        <Typography color="text.secondary" variant="caption" component="div">
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
  const hasOpen = turns.some((turn) => !turn.endedAt)
  useEffect(() => {
    if (!hasOpen) return
    const timer = setInterval(() => setTick((tick) => tick + 1), CLOCK_TICK_MS)
    return () => clearInterval(timer)
  }, [hasOpen])

  if (turns.length === 0) return null

  const stationIds = liveStationIds(turns)
  // Every dog visits every post over the day, so the whole entry is the queue at each of them.
  const starters = (participants ?? []).filter((participant) => !participant.cancelled).length

  return (
    <Box my={1}>
      <Typography variant="h6">{t('liveStatus.title')}</Typography>
      <Stack direction="row" flexWrap="wrap" gap={1} useFlexGap>
        {stationIds.map((stationId) => (
          <LiveStationCard
            event={event}
            key={stationId}
            single={stationIds.length === 1}
            starters={starters}
            stationId={stationId}
            turns={turns}
          />
        ))}
      </Stack>
    </Box>
  )
}
