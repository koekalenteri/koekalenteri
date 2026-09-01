import type { StationTurnSpan } from '../../../lib/stationTurns'
import type { StationTurnOp, StationTurnPause } from '../../../types'
import FreeBreakfastOutlined from '@mui/icons-material/FreeBreakfastOutlined'
import PlayArrow from '@mui/icons-material/PlayArrow'
import Stop from '@mui/icons-material/Stop'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorSnackbarOptions } from '../../../lib/client/snackbar'
import { completedGroupTurns, isBreakTurn, openTurn, stationThroughput, turnElapsedMs } from '../../../lib/stationTurns'
import { AsyncButton } from '../../components/AsyncButton'

const PAUSES: readonly StationTurnPause[] = ['coffee', 'lunch', 'weather', 'other']

/** A turn as this panel shows it: the shared span plus the public dog line. */
export interface StationTurnItem extends StationTurnSpan {
  dogs: Array<{ name: string; number?: number }>
}

interface Props {
  readonly stationId: string
  readonly turns: readonly StationTurnItem[]
  /** The dog picked in the scoring view; starting a turn puts this dog to work. */
  readonly selectedDog?: { id: string; name?: string; number?: number }
  readonly onTurn: (op: StationTurnOp) => Promise<unknown>
}

const turnDogLabel = (dog: { name: string; number?: number }) =>
  dog.number ? `${dog.number} ${dog.name}`.trim() : dog.name

const minutes = (ms: number) => Math.max(0, Math.round(ms / 60000))

/**
 * The post's clock (KOE-1259): what is happening right now, and the two buttons that move the day
 * along. Starting the next thing ends the previous one — one tap, usable in gloves in the rain.
 */
export const StationTurnControls = ({ stationId, turns, selectedDog, onTurn }: Props) => {
  const { t } = useTranslation()
  const [pauseMenuAnchor, setPauseMenuAnchor] = useState<HTMLElement>()
  // A live clock: re-render every half minute while a span is open, so "8 min" stays honest.
  const [, setTick] = useState(0)

  const open = openTurn(turns, stationId)
  const completed = completedGroupTurns(turns, stationId)
  const throughput = useMemo(() => stationThroughput(turns, stationId), [stationId, turns])

  const hasOpen = Boolean(open)
  useEffect(() => {
    if (!hasOpen) return
    const timer = setInterval(() => setTick((tick) => tick + 1), 30000)
    return () => clearInterval(timer)
  }, [hasOpen])

  const busyRef = useRef(false)
  const runOp = async (op: StationTurnOp) => {
    if (busyRef.current) return
    busyRef.current = true
    try {
      await onTurn(op)
    } catch {
      enqueueSnackbar(t('liveStatus.turnSaveFailed'), errorSnackbarOptions)
    } finally {
      busyRef.current = false
    }
  }

  const statusLine = () => {
    if (!open) return t('liveStatus.free')
    if (isBreakTurn(open)) {
      return t('liveStatus.pauseSince', {
        label: t(`liveStatus.pause.${open.pause ?? 'other'}`),
        time: t('dateFormat.time', { date: new Date(open.startedAt) }),
      })
    }
    const since = t('liveStatus.sinceMinutes', { minutes: minutes(turnElapsedMs(open)) })
    return `${open.dogs.map(turnDogLabel).join(', ')} · ${since}`
  }

  return (
    <Box sx={{ px: 2 }}>
      <Stack alignItems="center" direction="row" flexWrap="wrap" spacing={1} useFlexGap>
        <Typography sx={{ fontWeight: open && !isBreakTurn(open) ? 'bold' : undefined }} variant="body2">
          {statusLine()}
        </Typography>
        <Box flexGrow={1} />
        <AsyncButton
          disabled={!selectedDog}
          onClick={async () => {
            if (selectedDog) await runOp({ registrationIds: [selectedDog.id], type: 'start' })
          }}
          size="small"
          startIcon={<PlayArrow />}
          variant="outlined"
        >
          {t('liveStatus.startTurn')}
        </AsyncButton>
        <AsyncButton
          disabled={!open}
          onClick={() => runOp({ type: 'end' })}
          size="small"
          startIcon={<Stop />}
          variant="outlined"
        >
          {t(open && isBreakTurn(open) ? 'liveStatus.endBreak' : 'liveStatus.endTurn')}
        </AsyncButton>
        <Button
          disabled={Boolean(open && isBreakTurn(open))}
          onClick={(event) => setPauseMenuAnchor(event.currentTarget)}
          size="small"
          startIcon={<FreeBreakfastOutlined />}
          variant="outlined"
        >
          {t('liveStatus.startBreak')}
        </Button>
        <Menu anchorEl={pauseMenuAnchor} onClose={() => setPauseMenuAnchor(undefined)} open={Boolean(pauseMenuAnchor)}>
          {PAUSES.map((pause) => (
            <MenuItem
              key={pause}
              onClick={() => {
                setPauseMenuAnchor(undefined)
                void runOp({ pause, type: 'break' })
              }}
            >
              {t(`liveStatus.pause.${pause}`)}
            </MenuItem>
          ))}
        </Menu>
      </Stack>
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
    </Box>
  )
}
