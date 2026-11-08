import type { SortableRegistration } from '../../lib/registration'
import type { PublicConfirmedEvent, PublicStationTurn } from '../../types/Event'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getEvent } from '../../api/event'
import { useTickWhile } from '../../hooks/useTickWhile'
import { formatTypeOf, isEventLive } from '../../lib/event'
import { liveFormat, livePhaseLabel, scoresAtPosts, stationDogsAtOnce, stationPhases } from '../../lib/liveFormat'
import { stationQueueEntries } from '../../lib/rotation'
import {
  completedGroupTurns,
  currentPhase,
  dogsThrough,
  exercisesThrough,
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

/** A row of the published start list, as far as the live view reads it. */
type LiveParticipant = SortableRegistration & { cancelled?: boolean }

/**
 * The queue at a post, a part per group and exercise with the dogs it brings and how many a turn of it
 * holds. Where the dogs go round posts, a post's queue is the dogs whose group does an exercise there, a
 * group doing two coming twice (KOE-1665); elsewhere the post is the whole trial and the whole entry
 * queues at it, as one part.
 *
 * Before a split class's numbers are published the rows carry none, so the class counts as its first
 * range's group (`stationQueueEntries`); the numbers are out before the trial, so this is rare.
 */
const stationQueueOf = (
  event: PublicConfirmedEvent,
  stationId: string,
  participants: readonly LiveParticipant[]
): { dogs: number; dogsAtOnce: number }[] => {
  const station = event.stations?.find((item) => item.id === stationId)
  if (!station || !scoresAtPosts(formatTypeOf(event))) {
    return [{ dogs: participants.length, dogsAtOnce: stationDogsAtOnce(formatTypeOf(event), station) }]
  }
  return stationQueueEntries(event, stationId, participants).map(({ registrations, visit }) => ({
    dogs: registrations.length,
    dogsAtOnce: stationDogsAtOnce(formatTypeOf(event), visit),
  }))
}

interface StationCardProps {
  readonly event: PublicConfirmedEvent
  readonly stationId: string
  readonly turns: readonly PublicStationTurn[]
  /** The dogs entered and not cancelled, of which the post's queue is made. */
  readonly participants: readonly LiveParticipant[]
  readonly single: boolean
}

/**
 * One post's card. Split out of the list because a post says several things at once — who is on it,
 * how fast it has been going, and how much of the queue is left — and each of them is conditional.
 */
const LiveStationCard = ({ event, stationId, turns, participants, single }: StationCardProps) => {
  const { t } = useTranslation()

  const station = event.stations?.find((item) => item.id === stationId)
  const format = liveFormat(formatTypeOf(event))
  const phases = stationPhases(formatTypeOf(event), station)
  const open = openTurn(turns, stationId)
  const completed = completedGroupTurns(turns, stationId)
  const throughput = stationThroughput(turns, stationId)
  const queue = stationQueueOf(event, stationId, participants)
  const starters = queue.reduce((sum, group) => sum + group.dogs, 0)
  // The queue holds a dog once for each exercise it does here; the card counts the dogs.
  const through = exercisesThrough(turns, stationId)
  const wait = waitEstimate(throughput, queue, through, format.flow)
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
    if (!dog.mark) return name
    const mark = t(`liveStatus.mark.${dog.mark}`)
    return `${name} (${mark})`
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
        {t('liveStatus.through', { count: dogsThrough(turns, stationId) })}
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
  /**
   * The published start list: each dog placed in its group by class, day and number, to count
   * how many dogs each post still has to get through and how many a turn of them holds.
   */
  readonly participants?: readonly LiveParticipant[]
}) => {
  const { t } = useTranslation()
  // Polled turns fill in when the socket is quiet. Each poll remembers which prop value it was based
  // on, so the moment a WebSocket patch delivers fresher turns the stale poll result steps aside.
  const [polled, setPolled] = useState<{
    base: PublicConfirmedEvent['liveTurns']
    turns: PublicConfirmedEvent['liveTurns']
  }>()

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
  useTickWhile(isLiveNow(turns), CLOCK_TICK_MS)

  // Nothing to show once the trial is over: with every class's results published, the page is the
  // results, and the last dog's finishing time has had its day. The same rule lights the calendar.
  if (!isEventLive({ ...event, liveTurns: turns })) return null

  const stationIds = liveStationIds(turns)
  const entered = (participants ?? []).filter((participant) => !participant.cancelled)

  return (
    <Box
      sx={{
        my: 1,
      }}
    >
      <Typography variant="h3" component="h2">
        {t('liveStatus.title')}
      </Typography>
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
            single={liveFormat(formatTypeOf(event)).posts === 'one'}
            participants={entered}
            stationId={stationId}
            turns={turns}
          />
        ))}
      </Stack>
    </Box>
  )
}
