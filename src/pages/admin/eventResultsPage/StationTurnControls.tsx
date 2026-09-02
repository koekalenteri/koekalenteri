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
import { liveFormat, stationDogsAtOnce, turnNamesTask } from '../../../lib/liveFormat'
import { completedGroupTurns, isBreakTurn, openTurn, stationThroughput, turnElapsedMs } from '../../../lib/stationTurns'
import { AsyncButton } from '../../components/AsyncButton'

const PAUSES: readonly StationTurnPause[] = ['coffee', 'lunch', 'weather', 'other']

/** A turn as this panel shows it: the shared span plus the public dog line. */
export interface StationTurnItem extends StationTurnSpan {
  dogs: Array<{ name: string; number?: number; mark?: LiveMark }>
  taskIndex?: number
}

/** A dog the post can put to work: what the queue shows and what a turn is started with. */
interface TurnDog {
  id: string
  name?: string
  number?: number
}

interface Props {
  readonly station: Pick<EventStation, 'id' | 'tasks' | 'dogsAtOnce'>
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
  const [taskIndex, setTaskIndex] = useState(0)
  // A live clock: re-render every half minute while a span is open, so "8 min" stays honest.
  const [, setTick] = useState(0)

  const stationId = station.id
  const format = liveFormat(eventType)
  const dogsAtOnce = stationDogsAtOnce(eventType, station)
  const picksGroup = dogsAtOnce > 1 && (dogs?.length ?? 0) > 0
  const namesTask = turnNamesTask(eventType, station)

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

  // A dog runs a post once — except where the format says otherwise: a NOME-A dog goes out for
  // retrieve after retrieve, and a class that takes a two-task post in its own order comes back for
  // the other task. The timeline is the record, so a dog it already names is not sent out again. The
  // match is by number and name, the handles the public turn shape has.
  const runsAgain = format.tasks === 'retrieve'
  const hasRun = (dog: TurnDog) =>
    turns.some(
      (turn) =>
        turn.stationId === stationId &&
        !isBreakTurn(turn) &&
        (!namesTask || turn.taskIndex === taskIndex) &&
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
  const startIds = nextTurnIds()
  const selectedHasRun = Boolean(selectedDog && alreadyRun(selectedDog))

  const taskNumbers = Array.from({ length: station.tasks }, (_unused, index) => index)

  const handleStart = async () => {
    if (startIds.length === 0) return
    await runOp({ registrationIds: startIds, type: 'start', ...(namesTask ? { taskIndex } : {}) })
    setGroupIds([])
  }

  const toggleGroupDog = (id: string) =>
    setGroupIds((previous) => (previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]))

  const statusLine = () => {
    if (!open) return t('liveStatus.free')
    if (isBreakTurn(open)) {
      return t('liveStatus.pauseSince', {
        label: t(`liveStatus.pause.${open.pause ?? 'other'}`),
        time: t('dateFormat.time', { date: new Date(open.startedAt) }),
      })
    }
    const since = t('liveStatus.sinceMinutes', { minutes: minutes(turnElapsedMs(open)) })
    const task = open.taskIndex === undefined ? '' : ` · ${t('liveStatus.task', { number: open.taskIndex + 1 })}`
    return `${open.dogs.map(turnDogLabel).join(', ')}${task} · ${since}`
  }

  const markableDogs = format.marks.length > 0 && open && !isBreakTurn(open) ? open.dogs : []

  return (
    <Box sx={{ px: 2 }}>
      <Stack alignItems="center" direction="row" flexWrap="wrap" spacing={1} useFlexGap>
        <Typography sx={{ fontWeight: open && !isBreakTurn(open) ? 'bold' : undefined }} variant="body2">
          {statusLine()}
        </Typography>
        <Box flexGrow={1} />

        {/* Which of the post's tasks this turn runs, where the class takes them in its own order. */}
        {namesTask && (
          <ToggleButtonGroup
            exclusive
            onChange={(_event, value) => {
              if (value !== null) setTaskIndex(Number(value))
            }}
            size="small"
            value={taskIndex}
          >
            {taskNumbers.map((task) => (
              <ToggleButton key={`task-${task}`} value={task}>
                {t('liveStatus.task', { number: task + 1 })}
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

        <Tooltip title={selectedHasRun && startIds.length === 0 ? t('liveStatus.alreadyThrough') : ''}>
          <span>
            <AsyncButton
              disabled={startIds.length === 0}
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
        {t(dogsAtOnce > 1 ? 'liveStatus.completed' : 'liveStatus.completedDogs', { count: completed.length })}
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
