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
import { getRegistrationClass, sortRegistrationsByDateClassTimeAndNumber } from '../../../lib/registration'
import { classRound, stationVersion } from '../../../lib/results'
import { AsyncButton } from '../../components/AsyncButton'
import { makeArray } from '../components/eventForm/judgeSection/utils'
import { RoundOutcome } from './RoundOutcomeCell'
import { StationTurnControls } from './StationTurnControls'
import { TaskScore } from './TaskCell'
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
  eventResult?: Pick<EventResult, 'elimination' | 'retirement' | 'tasks'>
}

interface Props {
  readonly station: Pick<EventStation, 'id' | 'number' | 'tasks' | 'judges'>
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
 * Scoring at the post, while the test runs.
 *
 * The dog in front of the judge is the whole screen: it arrives, it is picked from the list — usually
 * the next start number — and one score goes in. The table views are for going through a class; this is
 * for going through the day, and saving one dog at a time is what makes it usable on a phone.
 *
 * Serves two callers that differ only in where the data comes from: the event secretary's own station
 * view, and the tokenized link a station secretary opens without an account.
 */
export function StationScoring({ station, eventType, subtitle, classes, registrations, onSave, turns, onTurn }: Props) {
  const { t } = useTranslation()

  const eventClasses = useMemo(() => [...new Set(registrations.map(getRegistrationClass))], [registrations])
  const [selectedClass, setSelectedClass] = useState<string | undefined>(eventClasses[0])
  const [selectedId, setSelectedId] = useState<string | undefined>()
  const [edit, setEdit] = useState<ResultEdit>(emptyEdit)
  const [lastJudge, setLastJudge] = useState<PublicJudge | undefined>()

  const eventClass = selectedClass ?? eventClasses[0]

  const dogs = useMemo(
    () =>
      registrations
        .filter((reg) => getRegistrationClass(reg) === eventClass)
        .sort(sortRegistrationsByDateClassTimeAndNumber),
    [eventClass, registrations]
  )

  // Only this post's slots, which is one task or two.
  const round = useMemo(() => {
    const classStations = classes?.find((item) => item.class === eventClass)?.stations
    return classRound([station], classStations).filter((task) => task.stationId === station.id)
  }, [classes, eventClass, station])

  const judges = useMemo(() => {
    const own = station.judges ?? []
    const classJudges = makeArray(classes?.find((item) => item.class === eventClass)?.judge)
    return (own.length ? own : classJudges).filter((judge): judge is PublicJudge => Boolean(judge?.id))
  }, [classes, eventClass, station.judges])

  const selected = dogs.find((dog) => dog.id === selectedId)

  /** A dog this post has already scored, so the judge can see at a glance who is still to come. */
  const isScored = useCallback(
    (dog: StationScoringDog) => dog.eventResult?.tasks?.some((task) => task.stationId === station.id) ?? false,
    [station.id]
  )

  const select = useCallback(
    (dog: StationScoringDog) => {
      setSelectedId(dog.id)
      // Start from what this post already recorded, so a correction edits rather than replaces.
      const tasks = (dog.eventResult?.tasks ?? [])
        .filter((task) => task.stationId === station.id)
        .map(({ updatedAt: _at, updatedBy: _by, ...task }) => task)

      setEdit({ elimination: dog.eventResult?.elimination, retirement: dog.eventResult?.retirement, tasks })
    },
    [station.id]
  )

  const handleSave = useCallback(async () => {
    if (!selected) return

    const stored = selected.eventResult
    const response = await onSave({
      basedOn: stationVersion(stored?.tasks, station.id),
      eventResult: { elimination: edit.elimination, retirement: edit.retirement, tasks: edit.tasks },
      id: selected.id,
      stationId: station.id,
    })

    enqueueSnackbar(response.saved.length ? t('results.saved') : t('results.alreadySaved'), { variant: 'success' })

    // Move on to the next dog that has not been through this post: at a post the queue is the job.
    const next = dogs.find((dog) => !isScored(dog) && dog.id !== selected.id)
    if (next) select(next)
    else setSelectedId(undefined)
  }, [dogs, edit, isScored, onSave, select, selected, station.id, t])

  return (
    <Paper
      elevation={2}
      sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, maxHeight: '100%', maxWidth: '100%' }}
    >
      <Box sx={{ pt: 2, px: 2 }}>
        <Typography variant="h6">
          {t('event.station')} {station.number}
        </Typography>
        {subtitle && (
          <Typography variant="body2" color="text.secondary">
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
          onTurn={onTurn}
          selectedDog={selected && { id: selected.id, name: selected.dog.name, number: selected.group?.number }}
          stationId={station.id}
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

          <Stack direction="row" spacing={2}>
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

          <RoundOutcome eventType={eventType} onChange={setEdit} stationId={station.id} stations={[]} value={edit} />
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
