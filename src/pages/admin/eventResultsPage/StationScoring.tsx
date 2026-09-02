import type { EventResultSubmission, EventResultsResponse } from '../../../api/registration'
import type {
  EventResult,
  EventStation,
  PublicDogEvent,
  PublicJudge,
  RegistrationClass,
  RegistrationGroup,
  RegistrationTime,
  StationTurnOp,
} from '../../../types'
import type { StationTurnItem } from './StationTurnControls'
import type { ResultEdit } from './types'
import Save from '@mui/icons-material/Save'
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
import { liveFormat } from '../../../lib/liveFormat'
import { getRegistrationClass, sortRegistrationsByDateClassTimeAndNumber } from '../../../lib/registration'
import { classRound, parseEventResultCode, scoresAtPosts, stationVersion } from '../../../lib/results'
import { openTurn } from '../../../lib/stationTurns'
import { AsyncButton } from '../../components/AsyncButton'
import { makeArray } from '../components/eventForm/judgeSection/utils'
import { JudgeSelect } from './JudgeSelect'
import { ResultSummary } from './ResultSummary'
import { ROUND_OUTCOME_ENABLED, RoundOutcome } from './RoundOutcome'
import { StationTurnControls } from './StationTurnControls'
import { TaskScore } from './TaskScore'
import { emptyEdit, isVoided } from './types'

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
}

interface Props {
  readonly station: Pick<EventStation, 'id' | 'number' | 'tasks' | 'judges' | 'dogsAtOnce'>
  readonly eventType: string
  /** The line under the post number: the event's name, and whatever else the caller may show. */
  readonly subtitle?: string
  /** For per-class splits of this post, and for the class judges where the post names none. */
  readonly classes?: PublicDogEvent['classes']
  /** Scorable dogs only. */
  readonly registrations: StationScoringDog[]
  readonly onSave: (submission: EventResultSubmission) => Promise<EventResultsResponse>
  /** The post's live timeline (KOE-1259); the clock and its buttons render only when provided. */
  readonly turns?: readonly StationTurnItem[]
  readonly onTurn?: (op: StationTurnOp) => Promise<unknown>
}

/**
 * What this post already recorded for a dog, as the edit starts from — so a correction edits rather
 * than replaces. A post-scored type's recording is its tasks; a qualitative type's is the judge's
 * decision, read back out of the stored string, and who made it.
 */
const seededEdit = (dog: StationScoringDog, stationId: string, eventType: string): ResultEdit => {
  const stored = dog.eventResult
  const outcome = { elimination: stored?.elimination, retirement: stored?.retirement }

  if (scoresAtPosts(eventType)) {
    const tasks = (stored?.tasks ?? [])
      .filter((task) => task.stationId === stationId)
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
 * The dog in front of the judge when the screen opens: whoever the open turn holds. Coming back to a
 * turn already started must land on that dog, not on an empty screen. The public turn shape carries
 * no ids, so the match is by start number and name — the same two things the post calls out.
 */
const dogAtPost = (
  registrations: readonly StationScoringDog[],
  turns: readonly StationTurnItem[] | undefined,
  stationId: string
): StationScoringDog | undefined => {
  const running = turns && openTurn(turns, stationId)?.dogs[0]
  if (!running) return undefined
  return registrations.find((dog) => dog.group?.number === running.number && dog.dog.name === running.name)
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
export function StationScoring({ station, eventType, subtitle, classes, registrations, onSave, turns, onTurn }: Props) {
  const { t } = useTranslation()

  // A qualitative type has no tasks to score; the judge's decision is the result, entered as such.
  const qualitative = !scoresAtPosts(eventType)
  // Where the day runs at one post, "Rasti 1" names nothing anyone calls it; the event is the title.
  const singlePost = liveFormat(eventType).posts === 'one'

  const eventClasses = useMemo(() => [...new Set(registrations.map(getRegistrationClass))], [registrations])
  // Read once, on opening: the dog already at the post is where the screen starts, class tab included.
  const [initial] = useState(() => dogAtPost(registrations, turns, station.id))
  const [selectedClass, setSelectedClass] = useState<string | undefined>(
    initial ? getRegistrationClass(initial) : eventClasses[0]
  )
  const [selectedId, setSelectedId] = useState<string | undefined>(initial?.id)
  const [edit, setEdit] = useState<ResultEdit>(initial ? seededEdit(initial, station.id, eventType) : emptyEdit)
  const [lastJudge, setLastJudge] = useState<PublicJudge | undefined>()

  const eventClass = selectedClass ?? eventClasses[0]

  const dogs = useMemo(
    () =>
      registrations
        .filter((reg) => getRegistrationClass(reg) === eventClass)
        .sort(sortRegistrationsByDateClassTimeAndNumber),
    [eventClass, registrations]
  )

  // Only this post's slots, which is one task or two — and none at all where nothing is scored.
  const round = useMemo(() => {
    if (qualitative) return []
    const classStations = classes?.find((item) => item.class === eventClass)?.stations
    return classRound([station], classStations).filter((task) => task.stationId === station.id)
  }, [classes, eventClass, qualitative, station])

  const judges = useMemo(() => {
    const own = station.judges ?? []
    const classJudges = makeArray(classes?.find((item) => item.class === eventClass)?.judge)
    return (own.length ? own : classJudges).filter((judge): judge is PublicJudge => Boolean(judge?.id))
  }, [classes, eventClass, station.judges])

  const selected = dogs.find((dog) => dog.id === selectedId)

  /** A dog this post has already scored, so the judge can see at a glance who is still to come. */
  const isScored = useCallback(
    (dog: StationScoringDog) => {
      const stored = dog.eventResult
      if (qualitative) return Boolean(stored?.result ?? stored?.elimination ?? stored?.retirement)
      return stored?.tasks?.some((task) => task.stationId === station.id) ?? false
    },
    [qualitative, station.id]
  )

  /** The queue as the turn controls need it, for picking a walk-up out of the class on show. */
  const turnDogs = useMemo(
    () => dogs.map((dog) => ({ done: isScored(dog), id: dog.id, name: dog.dog.name, number: dog.group?.number })),
    [dogs, isScored]
  )

  const select = useCallback(
    (dog: StationScoringDog) => {
      setSelectedId(dog.id)
      setEdit(seededEdit(dog, station.id, eventType))
    },
    [eventType, station.id]
  )

  const handleSave = useCallback(async () => {
    if (!selected) return

    const stored = selected.eventResult
    // A qualitative result is attributed to whoever is judging, as a task's score is at a post.
    const judge = qualitative ? (edit.judge ?? lastJudge ?? judges[0]) : undefined
    const response = await onSave({
      // Where the post is the whole trial, the version is the whole result's, as on the results page.
      basedOn: qualitative ? stored?.updatedAt : stationVersion(stored?.tasks, station.id),
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

    enqueueSnackbar(response.saved.length ? t('results.saved') : t('results.alreadySaved'), { variant: 'success' })

    // Move on to the next dog that has not been through this post: at a post the queue is the job.
    const next = dogs.find((dog) => !isScored(dog) && dog.id !== selected.id)
    if (next) select(next)
    else setSelectedId(undefined)
  }, [dogs, edit, isScored, judges, lastJudge, onSave, qualitative, select, selected, station.id, t])

  return (
    <Paper
      elevation={2}
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}
    >
      <Box sx={{ pt: 2, px: 2 }}>
        {!singlePost && (
          <Typography variant="h6">
            {t('event.station')} {station.number}
          </Typography>
        )}
        {subtitle && (
          <Typography color={singlePost ? undefined : 'text.secondary'} variant={singlePost ? 'h6' : 'body2'}>
            {subtitle}
          </Typography>
        )}
      </Box>

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
          selectedDog={turnDogs.find((dog) => dog.id === selected?.id)}
          station={station}
          turns={turns}
        />
      )}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, p: 2 }}>
        {dogs.map((dog) => (
          <Chip
            color={dog.id === selectedId ? 'primary' : 'default'}
            key={dog.id}
            label={`${dog.group?.number ?? '?'} ${dog.dog.name ?? ''}`}
            onClick={() => select(dog)}
            variant={isScored(dog) ? 'filled' : 'outlined'}
          />
        ))}
      </Box>

      {selected && (
        <Stack spacing={2} sx={{ flexGrow: 1, overflow: 'auto', px: 2 }}>
          <Typography variant="h6">
            {selected.group?.number}. {selected.dog.name}
          </Typography>
          {selected.handler?.name && (
            <Typography variant="body2" color="text.secondary">
              {selected.handler.name}
            </Typography>
          )}

          <Stack alignItems="center" direction="row" spacing={2}>
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
                disabled={isVoided(edit)}
                judges={judges}
                key={`${task.stationId}#${task.index}`}
                onChange={(item, points, zeroFault) =>
                  setEdit((prev) => ({
                    ...prev,
                    tasks: [
                      ...prev.tasks.filter((entry) => entry.index !== item.index),
                      {
                        index: item.index,
                        judge: prev.tasks.find((entry) => entry.index === item.index)?.judge ?? lastJudge ?? judges[0],
                        points,
                        stationId: item.stationId,
                        ...(zeroFault ? { zeroFault } : {}),
                      },
                    ],
                  }))
                }
                onJudgeChange={(item, judge) => {
                  setLastJudge(judge)
                  setEdit((prev) => ({
                    ...prev,
                    tasks: prev.tasks.map((entry) => (entry.index === item.index ? { ...entry, judge } : entry)),
                  }))
                }}
                task={task}
                value={edit.tasks.find((entry) => entry.index === task.index)}
              />
            ))}
          </Stack>

          {ROUND_OUTCOME_ENABLED && (
            <RoundOutcome eventType={eventType} onChange={setEdit} stationId={station.id} stations={[]} value={edit} />
          )}
        </Stack>
      )}

      <Stack direction="row" justifyContent="flex-end" sx={{ borderColor: '#bdbdbd', borderTop: '1px solid', p: 1 }}>
        <AsyncButton color="primary" disabled={!selected} onClick={handleSave} startIcon={<Save />} variant="contained">
          {t('results.save')}
        </AsyncButton>
      </Stack>
    </Paper>
  )
}
