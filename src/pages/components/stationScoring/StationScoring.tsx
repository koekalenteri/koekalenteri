import type { EventResultSubmission } from '@/api/registration'
import type {
  EventResult,
  EventResultsResponse,
  EventStation,
  PublicDogEvent,
  PublicJudge,
  RegistrationClass,
  RegistrationGroup,
  RegistrationTime,
  StationTurnOp,
  StationVisitLayout,
} from '@/types'
import type { StationTurnItem } from './StationTurnControls'
import type { ResultEdit } from './types'
import Save from '@mui/icons-material/Save'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { APIError } from '@/api/http'
import { reportError } from '@/lib/client/error'
import { errorSnackbarOptions } from '@/lib/client/snackbar'
import { compareRegistrationClasses } from '@/lib/event'
import { makeArray } from '@/lib/judge'
import { liveFormat, scoresAtPosts } from '@/lib/liveFormat'
import { getRegistrationClass } from '@/lib/registration'
import { formatTaskName, parseEventResultCode } from '@/lib/results'
import {
  effectiveJudge,
  endedAtExercise,
  endedBefore,
  exercisesAtPost,
  holdsScore,
  outcomeHeldElsewhere,
  stationVersion,
  visitSlots,
} from '@/lib/resultTasks'
import { openTurn } from '@/lib/stationTurns'
import { isObject } from '@/lib/utils'
import { AsyncButton } from '../AsyncButton'
import { JudgeSelect } from './JudgeSelect'
import { ResultSummary } from './ResultSummary'
import { RoundOutcome } from './RoundOutcome'
import { StationTurnControls } from './StationTurnControls'
import { TaskScore } from './TaskScore'
import { emptyEdit } from './types'

/**
 * A dog as this screen needs it. Structural on purpose: the event secretary's view has the whole
 * `Registration`, the tokenized station link only the minimal projection its audience is allowed.
 */
interface StationScoringDog {
  id: string
  class?: RegistrationClass | null
  eventType: string
  group?: RegistrationGroup & { time?: RegistrationTime }
  dog: { name?: string }
  handler?: { name?: string }
  eventResult?: Pick<EventResult, 'elimination' | 'retirement' | 'tasks' | 'result' | 'judge'> &
    Partial<Pick<EventResult, 'updatedAt'>>
  /**
   * The exercise of the dog's group at this place in the post's queue, where the post scores exercises
   * (KOE-1665). A dog doing two exercises here is in the list twice, once with each.
   */
  visit?: StationVisitLayout
}

interface Props {
  readonly station: Pick<EventStation, 'id' | 'number' | 'judges' | 'dogsAtOnce'>
  readonly eventType: string
  /** The line under the post number: the event's name, and whatever else the caller may show. */
  readonly subtitle?: string
  /** For the class judges where the post names none. */
  readonly classes?: PublicDogEvent['classes']
  /**
   * Scorable dogs only, in the order they come to the post (`stationQueue`): the groups as they arrive,
   * each in start order. The screen keeps that order.
   */
  readonly registrations: StationScoringDog[]
  readonly onSave: (submission: EventResultSubmission) => Promise<EventResultsResponse>
  /** The post's live timeline (KOE-1259); the clock and its buttons render only when provided. */
  readonly turns?: readonly StationTurnItem[]
  readonly onTurn?: (op: StationTurnOp) => Promise<unknown>
  /** The results are with the chief judge: nothing can be saved until the judge sends the trial back (KOE-1140). */
  readonly locked?: boolean
  /** What the notice of a locked trial says, for the caller knows how the lock can be lifted from where it is. */
  readonly lockedText?: string
  /** The save found the results locked after all; the caller marks its copy of the event as locked. */
  readonly onLocked?: () => void
  /**
   * The save was refused because the list is old, the dog gone from the trial or the running order
   * changed: the caller reads the list again.
   */
  readonly onRefused?: () => void
  /**
   * The server keeps an outcome this post does not hold, so the control only shows it (KOE-1615). The
   * token link's rule; the event secretary's post view may change any outcome.
   */
  readonly ownOutcomeOnly?: boolean
}

/**
 * The exercises the dog's group does at this post, from its visit (KOE-1665): the post's own scores. A
 * post the group comes to twice holds both exercises. The page has no running order to work them out
 * from; the visit's posts give the list `stationExercises` gives the server from the same layout.
 */
const exercisesHere = (dog: StationScoringDog, stationId: string): number[] =>
  dog.visit ? exercisesAtPost(dog.visit.exercisePosts, stationId) : []

/**
 * What this post already recorded for a dog, as the edit starts from — so a correction edits rather
 * than replaces. A post-scored type's recording is its tasks; a qualitative type's is the judge's
 * decision, read back out of the stored string, and who made it.
 */
const seededEdit = (dog: StationScoringDog, stationId: string, eventType: string): ResultEdit => {
  const stored = dog.eventResult
  const outcome = { elimination: stored?.elimination, retirement: stored?.retirement }

  if (scoresAtPosts(eventType)) {
    const here = exercisesHere(dog, stationId)
    const tasks = (stored?.tasks ?? [])
      .filter((task) => here.includes(task.exercise))
      .map(({ updatedAt: _at, updatedBy: _by, ...task }) => task)
    return { ...outcome, tasks }
  }

  const resultCode = parseEventResultCode(stored?.result, eventType, getRegistrationClass(dog))
  return {
    ...outcome,
    ...(resultCode ? { resultCode } : {}),
    ...(stored?.judge ? { judge: stored.judge } : {}),
    tasks: [],
  }
}

/**
 * A place in the post's queue: a dog and the exercise it does here. A dog whose group does two exercises
 * at the post is in the queue twice (KOE-1665).
 */
const entryKey = (dog: StationScoringDog): string => `${dog.id}#${dog.visit?.exercise ?? ''}`

/** The running order changed since this page read it, so the save named an exercise the post no longer does. */
const isLayoutChanged = (error: unknown): boolean =>
  error instanceof APIError && error.status === 409 && isObject(error.body) && error.body.error === 'staleData'

/**
 * The dog in front of the judge when the screen opens: whoever the open turn holds, at the exercise the
 * turn names. Coming back to a turn already started must land on that dog, not on an empty screen. The
 * public turn shape carries no ids, so the match is by start number and name — the same two things the
 * post calls out.
 */
const dogAtPost = (
  registrations: readonly StationScoringDog[],
  turns: readonly StationTurnItem[] | undefined,
  stationId: string
): StationScoringDog | undefined => {
  const open = turns && openTurn(turns, stationId)
  const running = open?.dogs[0]
  if (!running) return undefined
  return registrations.find(
    (dog) =>
      dog.group?.number === running.number &&
      dog.dog.name === running.name &&
      (open.exercise === undefined || dog.visit?.exercise === undefined || dog.visit.exercise === open.exercise)
  )
}

/**
 * Scoring at the post, while the test runs.
 *
 * The dog in front of the judge is the whole screen: it arrives, it is picked from the list — usually
 * the next start number — and one score goes in. The table views are for going through a class; this is
 * for going through the day, and saving one dog at a time is what makes it usable on a phone.
 *
 * Serves two callers that differ only in where the data comes from: the event secretary's own post
 * view, and the live entry link a judge's secretary opens without an account.
 */
export function StationScoring({
  station,
  eventType,
  subtitle,
  classes,
  registrations,
  onSave,
  turns,
  onTurn,
  locked,
  lockedText,
  onLocked,
  onRefused,
  ownOutcomeOnly = false,
}: Props) {
  const { t } = useTranslation()

  // A qualitative type has no tasks to score; the judge's decision is the result, entered as such.
  const qualitative = !scoresAtPosts(eventType)
  // Where the day runs at one post, "Suorituspaikka 1" names nothing anyone calls it; the event is the title.
  const singlePost = liveFormat(eventType).posts === 'one'

  // Where the rotation says who comes when, the classes are in the order they reach the post, as the dogs
  // came; elsewhere in the class order (KOE-1596).
  const eventClasses = useMemo(() => {
    const classes = [...new Set(registrations.map(getRegistrationClass))]
    return registrations.some((dog) => dog.visit) ? classes : classes.sort(compareRegistrationClasses)
  }, [registrations])
  // Read once, on opening: the dog already at the post is where the screen starts, class tab included.
  const [initial] = useState(() => dogAtPost(registrations, turns, station.id))
  const [selectedClass, setSelectedClass] = useState<string | undefined>(
    initial ? getRegistrationClass(initial) : eventClasses[0]
  )
  const [selectedKey, setSelectedKey] = useState<string | undefined>(initial && entryKey(initial))
  const [edit, setEdit] = useState<ResultEdit>(initial ? seededEdit(initial, station.id, eventType) : emptyEdit)
  const [lastJudge, setLastJudge] = useState<PublicJudge | undefined>()

  // The class on show may have left this post when the list was read again.
  const eventClass = selectedClass && eventClasses.includes(selectedClass) ? selectedClass : eventClasses[0]

  const dogs = useMemo(
    () => registrations.filter((reg) => getRegistrationClass(reg) === eventClass),
    [eventClass, registrations]
  )

  const judges = useMemo(() => {
    const own = station.judges ?? []
    const classJudges = makeArray(classes?.find((item) => item.class === eventClass)?.judge)
    return (own.length ? own : classJudges).filter((judge): judge is PublicJudge => Boolean(judge?.id))
  }, [classes, eventClass, station.judges])

  const selected = dogs.find((dog) => entryKey(dog) === selectedKey)
  // A dog in the queue twice, for two exercises here, is named with the exercise on its chip.
  const twice = useMemo(() => {
    const seen = new Set<string>()
    const repeated = new Set<string>()
    for (const dog of dogs) {
      if (seen.has(dog.id)) repeated.add(dog.id)
      seen.add(dog.id)
    }
    return repeated
  }, [dogs])

  // This post's slots for the dog in front of the judge: the exercise of its group it does here, whole or
  // in parts, and none at all where nothing is scored.
  const visit = selected?.visit
  const round = useMemo(
    () => (qualitative || !visit ? [] : visitSlots(station.id, visit)),
    [qualitative, station.id, visit]
  )
  // The dog's round ended at an exercise before this one, so it never came to it (KOE-1669).
  const ended = visit ? endedBefore(edit.retirement, visit.exercise, visit.exercisePosts) : false

  /**
   * A place in the queue this post has already scored, so the judge can see at a glance who is still to
   * come: the dog's score for the exercise of that place; a dog with no visit here has none. A place
   * whose exercise is the one the round ended at is done too, its outcome recorded there, and one after it
   * is never reached (KOE-1669).
   */
  const isScored = useCallback(
    (dog: StationScoringDog) => {
      const stored = dog.eventResult
      if (qualitative) return Boolean(stored?.result ?? stored?.elimination ?? stored?.retirement)
      const { retirement } = stored ?? {}
      const { visit: place } = dog
      if (!place) return false
      const endedAt = endedAtExercise(retirement, place.exercisePosts)
      if (endedAt !== undefined && place.exercise >= endedAt) return true
      const slots = visitSlots(station.id, place)
      return stored?.tasks?.some((task) => slots.some((slot) => holdsScore(slot, task))) ?? false
    },
    [qualitative, station.id]
  )

  /** The queue as the turn controls need it, for picking a walk-up out of the class on show. */
  const turnDogs = useMemo(
    () =>
      dogs.map((dog) => ({
        done: isScored(dog),
        id: dog.id,
        name: dog.dog.name,
        number: dog.group?.number,
        visit: dog.visit,
      })),
    [dogs, isScored]
  )

  const select = useCallback(
    (dog: StationScoringDog) => {
      setSelectedKey(entryKey(dog))
      setEdit(seededEdit(dog, station.id, eventType))
    },
    [eventType, station.id]
  )

  /** What a save the server did not take leaves on screen, and what the caller is told. */
  const settleRefusal = useCallback(
    (error: unknown) => {
      // Handed to the chief judge from somewhere else meanwhile: the scores stay on screen, unsaved.
      if (error instanceof APIError && error.status === 423) {
        enqueueSnackbar(t('results.kennelliitto.lockedSave'), { variant: 'error' })
        onLocked?.()
        return
      }
      // An expected state, not a fault. The edit was seeded from the old order and may hold an exercise the post
      // no longer does, under a place in the queue that still exists, so saving it would only be refused again:
      // the dog is let go, and the next pick starts from the list as read again.
      if (isLayoutChanged(error)) {
        enqueueSnackbar(t('results.layoutChanged'), errorSnackbarOptions)
        onRefused?.()
        setSelectedKey(undefined)
        return
      }
      // Anything else refuses this dog and nothing more: the scores stay on screen, another dog can be picked,
      // and a dog that is gone from the trial is a list that has moved on, which the caller reads again.
      reportError(error)
      enqueueSnackbar(t('results.saveFailed'), errorSnackbarOptions)
      if (error instanceof APIError && (error.status === 404 || error.status === 422)) onRefused?.()
    },
    [onLocked, onRefused, t]
  )

  const handleSave = useCallback(async () => {
    if (!selected) return

    const stored = selected.eventResult
    // A qualitative result is attributed to whoever is judging, as a task's score is at a post.
    const judge = qualitative ? (edit.judge ?? lastJudge ?? judges[0]) : undefined
    let response: EventResultsResponse
    try {
      response = await onSave({
        // Where the post is the whole trial, the version is the whole result's, as on the results page.
        basedOn: qualitative ? stored?.updatedAt : stationVersion(stored?.tasks, exercisesHere(selected, station.id)),
        eventResult: {
          elimination: edit.elimination,
          retirement: edit.retirement,
          tasks: edit.tasks,
          ...(qualitative ? { resultCode: edit.resultCode } : {}),
          ...(judge ? { judge } : {}),
        },
        id: selected.id,
        stationId: station.id,
      })
    } catch (error) {
      settleRefusal(error)
      return
    }

    enqueueSnackbar(response.saved.length ? t('results.saved') : t('results.alreadySaved'), { variant: 'success' })

    // Move on to the next place in the queue not scored yet: at a post the queue is the job.
    const next = dogs.find((dog) => !isScored(dog) && entryKey(dog) !== entryKey(selected))
    if (next) select(next)
    else setSelectedKey(undefined)
  }, [dogs, edit, isScored, judges, lastJudge, onSave, qualitative, select, selected, settleRefusal, station.id, t])

  const chipLabel = (dog: StationScoringDog) => {
    const name = `${dog.group?.number ?? '?'} ${dog.dog.name ?? ''}`
    return dog.visit && twice.has(dog.id)
      ? `${name} · ${t('results.column.task', { number: dog.visit.exercise })}`
      : name
  }

  return (
    <Paper
      elevation={2}
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}
    >
      <Box sx={{ pt: 2, px: 2 }}>
        {!singlePost && (
          <Typography variant="h3" component="h1">
            {t('event.station')} {station.number}
          </Typography>
        )}
        {subtitle && (
          <Typography
            color={singlePost ? undefined : 'text.secondary'}
            component={singlePost ? 'h1' : 'p'}
            variant={singlePost ? 'h3' : 'body2'}
          >
            {subtitle}
          </Typography>
        )}
      </Box>

      {locked && (
        <Alert severity="warning" sx={{ mt: 1, mx: 2 }}>
          {lockedText ?? t('results.kennelliitto.lockedSave')}
        </Alert>
      )}

      <Tabs onChange={(_event, value) => setSelectedClass(value)} sx={{ px: 2 }} value={eventClass ?? false}>
        {eventClasses.map((item) => (
          <Tab key={item} label={item} value={item} />
        ))}
      </Tabs>

      {turns && onTurn && (
        <StationTurnControls
          dogs={turnDogs}
          eventType={eventType}
          onTurn={onTurn}
          selectedDog={selected && turnDogs[dogs.indexOf(selected)]}
          station={station}
          turns={turns}
        />
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, p: 2 }}>
        {dogs.map((dog) => (
          <Chip
            color={entryKey(dog) === selectedKey ? 'primary' : 'default'}
            key={entryKey(dog)}
            label={chipLabel(dog)}
            onClick={() => select(dog)}
            variant={isScored(dog) ? 'filled' : 'outlined'}
          />
        ))}
      </Box>

      {selected && (
        <Stack spacing={2} sx={{ flexGrow: 1, overflow: 'auto', px: 2 }}>
          <Typography variant="h3" component="h2">
            {selected.group?.number}. {selected.dog.name}
          </Typography>
          {selected.handler?.name && (
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
              }}
            >
              {selected.handler.name}
            </Typography>
          )}

          <Stack
            direction="row"
            spacing={2}
            sx={{
              alignItems: 'center',
            }}
          >
            {qualitative && (
              <>
                <ResultSummary edit={edit} eventClass={eventClass} eventType={eventType} onChange={setEdit} />
                <JudgeSelect
                  judges={judges}
                  onChange={(judge) => {
                    setLastJudge(judge)
                    setEdit((prev) => ({ ...prev, judge }))
                  }}
                  value={edit.judge ?? lastJudge ?? judges[0]}
                />
              </>
            )}
            {round.map((task) => (
              <TaskScore
                defaultJudge={lastJudge}
                judges={judges}
                name={formatTaskName(task, t)}
                key={`${task.exercise}#${task.part}`}
                notReached={ended}
                onChange={(item, points, zeroFault) =>
                  setEdit((prev) => {
                    const existing = prev.tasks.find((entry) => holdsScore(item, entry))
                    const judge = effectiveJudge(existing, judges, lastJudge)
                    return {
                      ...prev,
                      tasks: [
                        ...prev.tasks.filter((entry) => !holdsScore(item, entry)),
                        {
                          exercise: item.exercise,
                          part: item.part,
                          points,
                          ...(judge ? { judge } : {}),
                          ...(zeroFault ? { zeroFault } : {}),
                        },
                      ],
                    }
                  })
                }
                onJudgeChange={(item, judge) => {
                  setLastJudge(judge)
                  setEdit((prev) => ({
                    ...prev,
                    tasks: prev.tasks.map((entry) => (holdsScore(item, entry) ? { ...entry, judge } : entry)),
                  }))
                }}
                // No column header names the task here, so a task not reached names it in its text.
                showName={ended}
                task={task}
                value={edit.tasks.find((entry) => holdsScore(task, entry))}
              />
            ))}
          </Stack>

          <RoundOutcome
            disabled={ownOutcomeOnly && !qualitative && outcomeHeldElsewhere(edit, exercisesHere(selected, station.id))}
            eventType={eventType}
            onChange={setEdit}
            places={visit ? [{ exercise: visit.exercise, stationId: station.id }] : undefined}
            stationId={station.id}
            stations={[]}
            value={edit}
          />
        </Stack>
      )}

      <Stack
        direction="row"
        sx={{
          borderColor: '#bdbdbd',
          borderTop: '1px solid',
          justifyContent: 'flex-end',
          p: 1,
        }}
      >
        <AsyncButton
          color="primary"
          disabled={!selected || locked}
          onClick={handleSave}
          startIcon={<Save />}
          variant="contained"
        >
          {t('results.save')}
        </AsyncButton>
      </Stack>
    </Paper>
  )
}
