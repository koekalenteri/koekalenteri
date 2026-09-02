import type { LivePhase } from '../../../lib/liveFormat'
import type { StationTurnSpan } from '../../../lib/stationTurns'
import type { EventStation, LiveMark, StationTurnOp, StationTurnPause } from '../../../types'
import FreeBreakfastOutlined from '@mui/icons-material/FreeBreakfastOutlined'
import GroupsOutlined from '@mui/icons-material/GroupsOutlined'
import PlayArrow from '@mui/icons-material/PlayArrow'
import Stop from '@mui/icons-material/Stop'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { errorSnackbarOptions } from '../../../lib/client/snackbar'
import { liveFormat, livePhaseLabel, stationDogsAtOnce, stationPhases } from '../../../lib/liveFormat'
import {
  dogsThrough,
  isBreakTurn,
  isWholeTurn,
  openTurn,
  stationThroughput,
  turnElapsedMs,
} from '../../../lib/stationTurns'
import { AsyncButton } from '../../components/AsyncButton'

const PAUSES: readonly StationTurnPause[] = ['coffee', 'lunch', 'weather', 'other']

/** A turn as this panel shows it: the shared span plus the public dog line. */
export interface StationTurnItem extends StationTurnSpan {
  dogs: Array<{ name: string; number?: number; mark?: LiveMark }>
}

/** A dog the post can put to work: what the queue shows and what a turn is started with. */
interface TurnDog {
  id: string
  name?: string
  number?: number
}

interface Props {
  readonly station: Pick<EventStation, 'id' | 'tasks' | 'dogsAtOnce' | 'phases'>
  /** Decides how many dogs a turn holds, whether it names a task, and what may be marked. */
  readonly eventType?: string
  readonly turns: readonly StationTurnItem[]
  /** The post's queue for the class on show, in start order — what a walk-up is picked from. */
  readonly dogs?: readonly TurnDog[]
  /** The dog picked in the scoring view; starting a turn puts this dog to work. */
  readonly selectedDog?: TurnDog
  readonly onTurn: (op: StationTurnOp) => Promise<unknown>
}

const turnDogLabel = (dog: { name?: string; number?: number }) =>
  dog.number ? `${dog.number} ${dog.name ?? ''}`.trim() : (dog.name ?? '')

const minutes = (ms: number) => Math.max(0, Math.round(ms / 60000))

/**
 * The post's clock (KOE-1259): what is happening right now, and the two buttons that move the day
 * along. Starting the next thing ends the previous one — one tap, usable in gloves in the rain.
 *
 * What else appears here is the format's, not this component's: a group picker only where a post takes
 * dogs several at a time, a task toggle only where a class orders the post's tasks for itself, and
 * marks only where the live facts are marks rather than scores.
 */
export const StationTurnControls = ({ station, eventType, turns, dogs, selectedDog, onTurn }: Props) => {
  const { t } = useTranslation()
  const [pauseMenuAnchor, setPauseMenuAnchor] = useState<HTMLElement>()
  const [groupMenuAnchor, setGroupMenuAnchor] = useState<HTMLElement>()
  const [markMenu, setMarkMenu] = useState<{ anchor: HTMLElement; index: number }>()
  const [groupIds, setGroupIds] = useState<string[]>([])
  // A live clock: re-render every half minute while a span is open, so "8 min" stays honest.
  const [, setTick] = useState(0)

  const stationId = station.id
  const format = liveFormat(eventType)
  const dogsAtOnce = stationDogsAtOnce(eventType, station)
  const picksGroup = dogsAtOnce > 1 && (dogs?.length ?? 0) > 0

  // The day's phases, where the format has them. The picker opens where the day is: on the phase
  // of the latest span at this post, or at the first phase before anything has run.
  const phases = useMemo(() => stationPhases(eventType, station), [eventType, station])
  const [phaseKey, setPhaseKey] = useState<string | undefined>(() => {
    const latest = turns.filter((turn) => turn.stationId === stationId && turn.phase).at(-1)
    return latest?.phase ?? phases[0]?.key
  })
  const phase = phases.find((item) => item.key === phaseKey)
  const phaseLabel = (item: LivePhase) => livePhaseLabel(item, t)
  const labelOf = (key: string | undefined) => {
    const known = phases.find((item) => item.key === key)
    return known ? phaseLabel(known) : (key ?? '')
  }

  const open = openTurn(turns, stationId)
  const through = dogsThrough(turns, stationId)
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

  // A dog runs a post once — except where the format says otherwise: a NOME-A dog goes out for
  // retrieve after retrieve, and a day in phases takes each dog through each phase once. The
  // timeline is the record, so a dog it already names is not sent out again. The match is by number
  // and name, the handles the public turn shape has.
  const runsAgain = format.tasks === 'retrieve'
  const hasRun = (dog: TurnDog) =>
    turns.some(
      (turn) =>
        turn.stationId === stationId &&
        !isBreakTurn(turn) &&
        (phases.length === 0 || turn.phase === phaseKey) &&
        turn.dogs.some((ran) => ran.number === dog.number && ran.name === dog.name)
    )
  const alreadyRun = (dog: TurnDog) => !runsAgain && hasRun(dog)
  const eligible = (dogs ?? []).filter((dog) => !alreadyRun(dog))

  // The picked group is what runs; the dog open in the scoring view is the single-dog shorthand for it.
  const nextTurnIds = () => {
    const picked = groupIds.filter((id) => eligible.some((dog) => dog.id === id))
    if (picked.length) return picked.slice(0, dogsAtOnce)
    return selectedDog && !alreadyRun(selectedDog) ? [selectedDog.id] : []
  }
  // A whole-entry phase starts with nobody picked: the briefing is everyone's at once.
  const startIds = phase?.whole ? [] : nextTurnIds()
  const canStart = Boolean(phase?.whole) || startIds.length > 0
  const selectedHasRun = Boolean(selectedDog && alreadyRun(selectedDog))

  const handleStart = async () => {
    if (!canStart) return
    await runOp({ registrationIds: startIds, type: 'start', ...(phaseKey ? { phase: phaseKey } : {}) })
    setGroupIds([])
  }

  const toggleGroupDog = (id: string) =>
    setGroupIds((previous) => (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]))

  const statusLine = () => {
    if (!open) return t('liveStatus.free')
    const time = t('dateFormat.time', { date: new Date(open.startedAt) })
    if (isBreakTurn(open)) {
      return t('liveStatus.pauseSince', { label: t(`liveStatus.pause.${open.pause ?? 'other'}`), time })
    }
    // A whole-entry phase reads like a break: its label and when it began, no dogs to name.
    if (isWholeTurn(open)) return t('liveStatus.pauseSince', { label: labelOf(open.phase), time })
    const since = t('liveStatus.sinceMinutes', { minutes: minutes(turnElapsedMs(open)) })
    const named = open.phase === undefined ? '' : ` · ${labelOf(open.phase)}`
    return `${open.dogs.map(turnDogLabel).join(', ')}${named} · ${since}`
  }

  const markableDogs = format.marks.length > 0 && open && !isBreakTurn(open) ? open.dogs : []

  return (
    <Box sx={{ px: 2 }}>
      <Stack alignItems="center" direction="row" flexWrap="wrap" spacing={1} useFlexGap>
        <Typography sx={{ fontWeight: open && !isBreakTurn(open) ? 'bold' : undefined }} variant="body2">
          {statusLine()}
        </Typography>
        <Box flexGrow={1} />

        {/* Which phase of the day the next turn is, where the day has phases. */}
        {phases.length > 0 && (
          <ToggleButtonGroup
            exclusive
            onChange={(_event, value) => {
              if (typeof value === 'string') setPhaseKey(value)
            }}
            size="small"
            value={phaseKey ?? null}
          >
            {phases.map((item) => (
              <ToggleButton key={item.key} value={item.key}>
                {phaseLabel(item)}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        )}

        {picksGroup && (
          <Button
            onClick={(event) => setGroupMenuAnchor(event.currentTarget)}
            size="small"
            startIcon={<GroupsOutlined />}
            variant="outlined"
          >
            {t('liveStatus.group', { count: groupIds.length })}
          </Button>
        )}

        <Tooltip title={selectedHasRun && !canStart ? t('liveStatus.alreadyThrough') : ''}>
          <span>
            <AsyncButton
              disabled={!canStart}
              onClick={handleStart}
              size="small"
              startIcon={<PlayArrow />}
              variant="outlined"
            >
              {t('liveStatus.startTurn')}
            </AsyncButton>
          </span>
        </Tooltip>
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

        {/* The walk-up, picked before it is started: the menu stays open so several dogs go in with
            one visit, and the count on the button says how many are in hand. */}
        <Menu anchorEl={groupMenuAnchor} onClose={() => setGroupMenuAnchor(undefined)} open={Boolean(groupMenuAnchor)}>
          {eligible.map((dog) => (
            <MenuItem key={dog.id} onClick={() => toggleGroupDog(dog.id)}>
              <Checkbox checked={groupIds.includes(dog.id)} size="small" sx={{ mr: 1, p: 0 }} />
              {turnDogLabel(dog)}
            </MenuItem>
          ))}
        </Menu>
      </Stack>

      {/* What each dog of the open group did, for the formats whose live facts are marks. */}
      {markableDogs.length > 0 && (
        <Stack direction="row" flexWrap="wrap" gap={1} sx={{ pb: 1 }} useFlexGap>
          {markableDogs.map((dog, index) => (
            <Chip
              key={`${dog.number ?? ''}-${dog.name}`}
              label={dog.mark ? `${turnDogLabel(dog)} · ${t(`liveStatus.mark.${dog.mark}`)}` : turnDogLabel(dog)}
              onClick={(event) => setMarkMenu({ anchor: event.currentTarget, index })}
              size="small"
              variant={dog.mark ? 'filled' : 'outlined'}
            />
          ))}
          <Menu anchorEl={markMenu?.anchor} onClose={() => setMarkMenu(undefined)} open={Boolean(markMenu)}>
            {format.marks.map((mark) => (
              <MenuItem
                key={mark}
                onClick={() => {
                  const index = markMenu?.index
                  setMarkMenu(undefined)
                  if (index !== undefined) void runOp({ index, mark, type: 'mark' })
                }}
              >
                {t(`liveStatus.mark.${mark}`)}
              </MenuItem>
            ))}
          </Menu>
        </Stack>
      )}

      <Typography color="text.secondary" variant="caption">
        {t('liveStatus.through', { count: through })}
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
