import type { PublicConfirmedEvent } from '../../types/Event'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getEvent } from '../../api/event'
import {
  completedGroupTurns,
  isBreakTurn,
  liveStationIds,
  openTurn,
  stationThroughput,
  turnElapsedMs,
} from '../../lib/stationTurns'

const POLL_INTERVAL_MS = 60000
const CLOCK_TICK_MS = 30000

const minutes = (ms: number) => Math.max(0, Math.round(ms / 60000))

/**
 * The live view of the trial day on the public start list page (KOE-1259): which dogs are at each
 * post right now, the current break, and how fast the queue is actually moving. The WebSocket keeps
 * it current; a polling fallback keeps it correct over the venue's own bad signal.
 */
export const LiveStatus = ({ event }: { readonly event: PublicConfirmedEvent }) => {
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
  const stationLabel = (stationId: string) => {
    const station = event.stations?.find((item) => item.id === stationId)
    if (!station && stationIds.length === 1) return t('liveStatus.title')
    return t('liveStatus.station', { number: station?.number ?? stationId })
  }

  return (
    <Box my={1}>
      <Typography variant="h6">{t('liveStatus.title')}</Typography>
      <Stack direction="row" flexWrap="wrap" gap={1} useFlexGap>
        {stationIds.map((stationId) => {
          const open = openTurn(turns, stationId)
          const completed = completedGroupTurns(turns, stationId)
          const throughput = stationThroughput(turns, stationId)

          let statusLine = t('liveStatus.free')
          if (open && isBreakTurn(open)) {
            statusLine = t('liveStatus.pauseSince', {
              label: t(`liveStatus.pause.${open.pause ?? 'other'}`),
              time: t('dateFormat.time', { date: new Date(open.startedAt) }),
            })
          } else if (open) {
            const dogsLine = open.dogs
              .map((dog) => (dog.number ? `${dog.number} ${dog.name}`.trim() : dog.name))
              .join(', ')
            const since = t('liveStatus.sinceMinutes', {
              minutes: minutes(turnElapsedMs(open)),
            })
            statusLine = `${dogsLine} · ${since}`
          }

          return (
            <Paper key={stationId} sx={{ minWidth: 220, p: 1.5 }} variant="outlined">
              <Typography color="text.secondary" variant="overline">
                {stationLabel(stationId)}
              </Typography>
              <Typography sx={{ fontWeight: open && !isBreakTurn(open) ? 'bold' : undefined }} variant="body2">
                {statusLine}
              </Typography>
              <Typography color="text.secondary" variant="caption">
                {t('liveStatus.completed', { count: completed.length })}
                {throughput
                  ? ` · ${t('liveStatus.throughput', {
                      max: minutes(throughput.maxMs),
                      mean: minutes(throughput.meanMs),
                      min: minutes(throughput.minMs),
                    })}`
                  : ` · ${t('liveStatus.noEstimate')}`}
              </Typography>
            </Paper>
          )
        })}
      </Stack>
    </Box>
  )
}
