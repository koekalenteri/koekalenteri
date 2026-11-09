import type { TFunction } from 'i18next'
import type { FormatOwner } from '@/lib/event'
import type { LivePhase } from '@/lib/liveFormat'
import type { StationTurnSpan } from '@/lib/stationTurns'
import type { EventStation, LiveMark, StationTurnOp, StationTurnPause, StationVisitLayout } from '@/types'
import FreeBreakfastOutlined from '@mui/icons-material/FreeBreakfastOutlined'
import GroupsOutlined from '@mui/icons-material/GroupsOutlined'
import PlayArrow from '@mui/icons-material/PlayArrow'
import SkipNext from '@mui/icons-material/SkipNext'
import Stop from '@mui/icons-material/Stop'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Chip from '@mui/material/Chip'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import Stack from '@mui/material/Stack'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatTypeOf } from '@/lib/event'
import { liveFormat, livePhaseLabel, stationDogsAtOnce, stationPhases } from '@/lib/liveFormat'
import {
  currentPhase,
  dogsThrough,
  isBreakTurn,
  isWholeTurn,
  openTurn,
  stationThroughput,
  turnElapsedMs,
} from '@/lib/stationTurns'
import { useTickWhile } from '../../../hooks/useTickWhile'
import { AsyncButton } from '../AsyncButton'
import { useTurnOp } from './useTurnOp'

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
  /** Already scored at this post: its day here is over, whatever the timeline says. */
  done?: boolean
  /**
   * The exercise of its group the dog does at this place in the queue, where the post scores exercises
   * (KOE-1665). A dog doing two exercises here is in the queue twice, once for each.
   */
  visit?: Pick<StationVisitLayout, 'exercise' | 'dogsAtOnce'>
}

interface Props {
  readonly station: Pick<EventStation, 'id' | 'tasks' | 'dogsAtOnce' | 'phases'>
  /**
   * The trial, whose format (`formatTypeOf`) decides how many dogs a turn holds, whether it names a task,
   * and what may be marked.
   */
  readonly event?: FormatOwner
  readonly turns: readonly StationTurnItem[]
  /** The post's queue for the class on show, in start order — what a walk-up is picked from. */
  readonly dogs?: readonly TurnDog[]
  /** The dog picked in the scoring view; starting a turn puts this dog to work. */
  readonly selectedDog?: TurnDog
  readonly onTurn: (op: StationTurnOp) => Promise<unknown>
}

type RunOp = (op: StationTurnOp) => Promise<void>

const turnDogLabel = (dog: { name?: string; number?: number }) =>
  dog.number ? `${dog.number} ${dog.name ?? ''}`.trim() : (dog.name ?? '')

const minutes = (ms: number) => Math.max(0, Math.round(ms / 60000))

/** The turn names no exercise, the dog's place in the queue names none, or both name the same one. */
const sameExercise = (turn: StationTurnItem, dog: TurnDog) =>
  turn.exercise === undefined || dog.visit === undefined || turn.exercise === dog.visit.exercise

/** Whether the timeline already has the dog running this post for its exercise. */
const hasRun = (turns: readonly StationTurnItem[], stationId: string, dog: TurnDog) =>
  turns.some(
    (turn) =>
      turn.stationId === stationId &&
      !isBreakTurn(turn) &&
      sameExercise(turn, dog) &&
      turn.dogs.some((ran) => ran.number === dog.number && ran.name === dog.name)
  )

/** The phase after the one the open run is in, where the day has one. */
const nextPhaseOf = (runPhases: readonly LivePhase[], openPhase: string | undefined) =>
  openPhase === undefined ? undefined : runPhases[runPhases.findIndex((item) => item.key === openPhase) + 1]

interface NextTurnInput {
  groupIds: readonly string[]
  pickable: readonly TurnDog[]
  head: TurnDog | undefined
  dogsAtOnce: number
  selectedDog: TurnDog | undefined
  alreadyRun: (dog: TurnDog) => boolean
}

/** The picked group is what runs; the dog open in the scoring view is the single-dog shorthand for it. */
const nextTurnOf = ({ groupIds, pickable, head, dogsAtOnce, selectedDog, alreadyRun }: NextTurnInput) => {
  const picked = groupIds.filter((id) => pickable.some((dog) => dog.id === id))
  if (picked.length) return { exercise: head?.visit?.exercise, ids: picked.slice(0, dogsAtOnce) }
  return selectedDog && !alreadyRun(selectedDog)
    ? { exercise: selectedDog.visit?.exercise, ids: [selectedDog.id] }
    : { ids: [] }
}

/** What the post is doing right now, as the clock's line reads it. */
const statusLineOf = (
  open: StationTurnItem | undefined,
  labelOf: (key: string | undefined) => string,
  t: TFunction
): string => {
  if (!open) return t('liveStatus.free')
  const time = t('dateFormat.time', { date: new Date(open.startedAt) })
  if (isBreakTurn(open)) {
    return t('liveStatus.pauseSince', { label: t(`liveStatus.pause.${open.pause ?? 'other'}`), time })
  }
  // A whole-entry phase reads like a break: its label and when it began, no dogs to name.
  if (isWholeTurn(open)) return t('liveStatus.pauseSince', { label: labelOf(currentPhase(open)), time })
  const since = t('liveStatus.sinceMinutes', { minutes: minutes(turnElapsedMs(open)) })
  const openPhase = currentPhase(open)
  const named = openPhase === undefined ? '' : ` · ${labelOf(openPhase)}`
  return `${open.dogs.map(turnDogLabel).join(', ')}${named} · ${since}`
}

/** The break button and the kinds of break it offers. A break waits for the post to be free. */
const BreakMenu = ({ disabled, runOp }: { readonly disabled: boolean; readonly runOp: RunOp }) => {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<HTMLElement>()

  return (
    <>
      <Button
        disabled={disabled}
        onClick={(event) => setAnchor(event.currentTarget)}
        size="small"
        startIcon={<FreeBreakfastOutlined />}
        variant="outlined"
      >
        {t('liveStatus.startBreak')}
      </Button>
      <Menu anchorEl={anchor} onClose={() => setAnchor(undefined)} open={Boolean(anchor)}>
        {PAUSES.map((pause) => (
          <MenuItem
            key={pause}
            onClick={() => {
              setAnchor(undefined)
              void runOp({ pause, type: 'break' })
            }}
          >
            {t(`liveStatus.pause.${pause}`)}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

interface GroupPickerProps {
  readonly groupIds: readonly string[]
  readonly pickable: readonly TurnDog[]
  readonly onToggle: (id: string) => void
}

/**
 * The walk-up, picked before it is started: the menu stays open so several dogs go in with one visit, and
 * the count on the button says how many are in hand.
 */
const GroupPicker = ({ groupIds, pickable, onToggle }: GroupPickerProps) => {
  const { t } = useTranslation()
  const [anchor, setAnchor] = useState<HTMLElement>()

  return (
    <>
      <Button
        onClick={(event) => setAnchor(event.currentTarget)}
        size="small"
        startIcon={<GroupsOutlined />}
        variant="outlined"
      >
        {t('liveStatus.group', { count: groupIds.length })}
      </Button>
      <Menu anchorEl={anchor} onClose={() => setAnchor(undefined)} open={Boolean(anchor)}>
        {pickable.map((dog) => (
          <MenuItem key={dog.id} onClick={() => onToggle(dog.id)}>
            <Checkbox checked={groupIds.includes(dog.id)} size="small" sx={{ mr: 1, p: 0 }} />
            {turnDogLabel(dog)}
          </MenuItem>
        ))}
      </Menu>
    </>
  )
}

interface MarkChipsProps {
  readonly dogs: StationTurnItem['dogs']
  readonly marks: readonly LiveMark[]
  readonly runOp: RunOp
}

/** What each dog of the open group did, for the formats whose live facts are marks. */
const MarkChips = ({ dogs, marks, runOp }: MarkChipsProps) => {
  const { t } = useTranslation()
  const [menu, setMenu] = useState<{ anchor: HTMLElement; index: number }>()

  return (
    <Stack
      direction="row"
      useFlexGap
      sx={{
        flexWrap: 'wrap',
        gap: 1,
        pb: 1,
      }}
    >
      {dogs.map((dog, index) => {
        const mark = dog.mark ? t(`liveStatus.mark.${dog.mark}`) : undefined
        return (
          <Chip
            key={`${dog.number ?? ''}-${dog.name}`}
            label={mark ? `${turnDogLabel(dog)} · ${mark}` : turnDogLabel(dog)}
            onClick={(event) => setMenu({ anchor: event.currentTarget, index })}
            size="small"
            variant={dog.mark ? 'filled' : 'outlined'}
          />
        )
      })}
      <Menu anchorEl={menu?.anchor} onClose={() => setMenu(undefined)} open={Boolean(menu)}>
        {marks.map((mark) => (
          <MenuItem
            key={mark}
            onClick={() => {
              const index = menu?.index
              setMenu(undefined)
              if (index !== undefined) void runOp({ index, mark, type: 'mark' })
            }}
          >
            {t(`liveStatus.mark.${mark}`)}
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  )
}

/** How many dogs the post has seen, and how long a turn has taken, which is what an estimate is made of. */
const ThroughputLine = ({
  turns,
  stationId,
}: {
  readonly turns: readonly StationTurnItem[]
  readonly stationId: string
}) => {
  const { t } = useTranslation()
  const through = dogsThrough(turns, stationId)
  const throughput = useMemo(() => stationThroughput(turns, stationId), [stationId, turns])

  return (
    <Typography
      variant="caption"
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
  )
}
/** A phase's name: the day's own label for a phase it knows, the key as it stands otherwise. */
const phaseLabelOf = (phases: readonly LivePhase[], key: string | undefined, t: TFunction) => {
  const known = phases.find((item) => item.key === key)
  return known ? livePhaseLabel(known, t) : (key ?? '')
}

interface ClockInput {
  turns: readonly StationTurnItem[]
  stationId: string
  runPhases: readonly LivePhase[]
  marks: readonly LiveMark[]
}

/** What the post's timeline says now: the open span, and what can follow it. */
const clockOf = ({ turns, stationId, runPhases, marks }: ClockInput) => {
  const open = openTurn(turns, stationId)
  const openIsBreak = Boolean(open) && isBreakTurn(open ?? {})
  const runShown = Boolean(open) && !openIsBreak
  return {
    // The day's dogs are named and their marks offered only while a run, not a break, is open.
    markableDogs: marks.length > 0 && open && runShown ? open.dogs : [],
    // Where the open run can move on to: the phase after the one it is in, if the day has one.
    nextPhase: nextPhaseOf(runPhases, open && runShown ? currentPhase(open) : undefined),
    open,
    openIsBreak,
    runOpen: runShown && !isWholeTurn(open ?? {}),
    runShown,
    // The briefing comes before the first run, never after it; a break waits for the post to be free.
    runStarted: turns.some((turn) => turn.stationId === stationId && !isBreakTurn(turn) && !isWholeTurn(turn)),
  }
}

interface QueueInput {
  turns: readonly StationTurnItem[]
  station: Props['station']
  formatType: string | undefined
  dogs: readonly TurnDog[] | undefined
  selectedDog: TurnDog | undefined
  groupIds: readonly string[]
}

/**
 * Who the next turn is for.
 *
 * A dog runs a post once for each exercise it does there, except where the format says otherwise: a NOME-A
 * dog goes out for retrieve after retrieve. The timeline is the record, so a dog it already names for the
 * exercise is not sent out again; and a dog already scored for it is done whatever the timeline says, since
 * a score is the end of that exercise. The match is by number and name, the handles the public shape has,
 * and by the exercise where both the turn and the queue name one.
 *
 * A turn holds as many dogs as the exercise at the head of the queue takes (KOE-1665): one class may do it
 * one at a time and the next in pairs. With nobody left queueing, the dog on show. A turn is for one
 * exercise, so a walk-up is picked among the dogs queueing for the head's.
 */
const queueOf = ({ turns, station, formatType, dogs, selectedDog, groupIds }: QueueInput) => {
  const runsAgain = liveFormat(formatType).tasks === 'retrieve'
  const alreadyRun = (dog: TurnDog) => Boolean(dog.done) || (!runsAgain && hasRun(turns, station.id, dog))
  const eligible = (dogs ?? []).filter((dog) => !alreadyRun(dog))
  const head = eligible[0] ?? selectedDog
  const dogsAtOnce = stationDogsAtOnce(formatType, head?.visit ?? station)
  const pickable = eligible.filter((dog) => dog.visit?.exercise === head?.visit?.exercise)
  const start = nextTurnOf({ alreadyRun, dogsAtOnce, groupIds, head, pickable, selectedDog })
  const canStart = start.ids.length > 0
  return {
    canStart,
    pickable,
    picksGroup: dogsAtOnce > 1 && (dogs?.length ?? 0) > 0,
    // Said when the dog on show cannot start: its day at this post is over.
    selectedThrough: !canStart && Boolean(selectedDog && alreadyRun(selectedDog)),
    start,
  }
}

/** A run starts at the day's first phase, where the day has phases, and names its exercise where it has one. */
const startOpOf = (runPhases: readonly LivePhase[], start: { ids: string[]; exercise?: number }): StationTurnOp => {
  const first = runPhases[0]
  return {
    registrationIds: start.ids,
    type: 'start',
    ...(first ? { phase: first.key } : {}),
    ...(start.exercise === undefined ? {} : { exercise: start.exercise }),
  }
}

/** The label of the button that moves an open run on. */
const nextPhaseLabelOf = (nextPhase: LivePhase | undefined, runPhases: readonly LivePhase[], t: TFunction) => {
  if (nextPhase) return t('liveStatus.nextPhaseTo', { label: livePhaseLabel(nextPhase, t) })
  return t(runPhases.length > 1 ? 'liveStatus.nextPhase' : 'liveStatus.startTurn')
}

const toggled = (ids: readonly string[], id: string) =>
  ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]

/**
 * The post's clock (KOE-1259): what is happening right now, and the two buttons that move the day
 * along. Starting the next thing ends the previous one — one tap, usable in gloves in the rain.
 *
 * What else appears here is the format's, not this component's: a group picker only where a post takes
 * dogs several at a time, the day's phases only where the format has them — a run starts at the first,
 * "next phase" moves it on and closes the one it was in, and it can be ended at any point; a phase the
 * whole entry attends comes before the first run and never after — and marks only where the live facts
 * are marks rather than scores. A break waits for the post to be free: ending the run is one tap.
 */
export const StationTurnControls = ({ station, event, turns, dogs, selectedDog, onTurn }: Props) => {
  const { t } = useTranslation()
  const formatType = event ? formatTypeOf(event) : undefined
  const [groupIds, setGroupIds] = useState<string[]>([])
  const runOp = useTurnOp(onTurn)
  const stationId = station.id
  const { marks } = liveFormat(formatType)

  // The day's phases, where the format has them: the ones a run goes through in order, and the ones
  // the whole entry attends at once, which are started on their own like a break is.
  const phases = useMemo(() => stationPhases(formatType, station), [formatType, station])
  const runPhases = phases.filter((item) => !item.whole)
  const wholePhases = phases.filter((item) => item.whole)

  const clock = clockOf({ marks, runPhases, stationId, turns })
  const queue = queueOf({ dogs, formatType, groupIds, selectedDog, station, turns })
  const { open } = clock

  // A live clock: re-render every half minute while a span is open, so "8 min" stays honest.
  useTickWhile(Boolean(open), 30000)

  const handleStart = async () => {
    if (!queue.canStart) return
    await runOp(startOpOf(runPhases, queue.start))
    setGroupIds([])
  }

  return (
    <Box sx={{ px: 2 }}>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Typography sx={{ fontWeight: clock.runShown ? 'bold' : undefined }} variant="body2">
          {statusLineOf(open, (key) => phaseLabelOf(phases, key, t), t)}
        </Typography>
        <Box
          sx={{
            flexGrow: 1,
          }}
        />

        {/* A phase the whole entry attends at once is started on its own, like a break: nobody is picked. */}
        {wholePhases.map((item) => (
          <AsyncButton
            disabled={clock.runStarted || Boolean(open)}
            key={item.key}
            onClick={() => runOp({ phase: item.key, registrationIds: [], type: 'start' })}
            size="small"
            variant="outlined"
          >
            {livePhaseLabel(item, t)}
          </AsyncButton>
        ))}

        {queue.picksGroup && (
          <GroupPicker
            groupIds={groupIds}
            onToggle={(id) => setGroupIds((previous) => toggled(previous, id))}
            pickable={queue.pickable}
          />
        )}

        {/* One button for what comes next: a run while none is under way, and while one is, its next
            phase — or nothing at all, since starting another dog over a running one is not a thing. */}
        {clock.runOpen ? (
          <AsyncButton
            disabled={!clock.nextPhase}
            onClick={() => runOp({ type: 'next' })}
            size="small"
            startIcon={runPhases.length > 1 ? <SkipNext /> : <PlayArrow />}
            variant="outlined"
          >
            {nextPhaseLabelOf(clock.nextPhase, runPhases, t)}
          </AsyncButton>
        ) : (
          <Tooltip title={queue.selectedThrough ? t('liveStatus.alreadyThrough') : ''}>
            <span>
              <AsyncButton
                disabled={!queue.canStart}
                onClick={handleStart}
                size="small"
                startIcon={<PlayArrow />}
                variant="outlined"
              >
                {t('liveStatus.startTurn')}
              </AsyncButton>
            </span>
          </Tooltip>
        )}
        <AsyncButton
          disabled={!open}
          onClick={() => runOp({ type: 'end' })}
          size="small"
          startIcon={<Stop />}
          variant="outlined"
        >
          {t(clock.openIsBreak ? 'liveStatus.endBreak' : 'liveStatus.endTurn')}
        </AsyncButton>
        <BreakMenu disabled={Boolean(open)} runOp={runOp} />
      </Stack>

      {clock.markableDogs.length > 0 && <MarkChips dogs={clock.markableDogs} marks={marks} runOp={runOp} />}

      <ThroughputLine stationId={stationId} turns={turns} />
    </Box>
  )
}
