import type { DayKey, DogEvent, EventExercise, EventRotationGroup, EventStation, Patch } from '@/types'
import AddOutlined from '@mui/icons-material/AddOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { nanoid } from 'nanoid'
import { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { getEventDays } from '@/lib/event'
import { scoresAtPosts } from '@/lib/results'
import { groupExercises, rotationGroupDay, stationParts } from '@/lib/rotation'
import { RotationEditor } from './RotationEditor'
import { StationRow } from './StationRow'

export type StationsEditorEvent = Pick<
  DogEvent,
  'classes' | 'endDate' | 'eventType' | 'judges' | 'rotations' | 'startDate' | 'stations'
>

export interface Props {
  readonly event: StationsEditorEvent
  readonly disabled?: boolean
  readonly onChange?: (event: Patch<DogEvent>) => void
}

/**
 * Posts are numbered within their own day, because that is how a course is actually built: each day
 * gets its own posts 1..n. Numbering restarts rather than running on across the event.
 */
const renumber = (stations: EventStation[]): EventStation[] => {
  const perDay = new Map<string, number>()

  return stations.map((station) => {
    const day = station.date
    const number = (perDay.get(day) ?? 0) + 1
    perDay.set(day, number)

    return station.number === number ? station : { ...station, number }
  })
}

/**
 * A post as this page saves it: its split under the name it has had since KOE-1665, the legacy
 * `tasks` read once and dropped. A count of exercises stored on a post in dev before the running order
 * is dropped too: an exercise is the running order's now (KOE-1665).
 */
const savedStation = ({ tasks, ...station }: EventStation & { taskCount?: number }): EventStation => {
  const { taskCount: _dropped, ...rest } = station
  return { ...rest, parts: stationParts({ parts: station.parts, tasks }) }
}

/**
 * A group as this page saves it, in the shape of the running order: a group stored in dev before the
 * exercises carries `posts`, which goes, and is saved without exercises until it is removed.
 */
const savedGroup = (
  { class: eventClass, firstNumber, lastNumber }: EventRotationGroup,
  exercises: EventExercise[]
): EventRotationGroup => ({
  class: eventClass,
  exercises,
  ...(firstNumber === undefined ? {} : { firstNumber }),
  ...(lastNumber === undefined ? {} : { lastNumber }),
})

/**
 * The groups as this page saves them. An exercise at a removed post goes, and so does a group left with
 * no exercise by that or whose class no longer runs on the day of its posts.
 */
const savedRotations = (event: StationsEditorEvent, rotations: EventRotationGroup[], stations: EventStation[]) =>
  rotations
    .flatMap((group) => {
      const exercises = groupExercises(group)
      const kept = exercises.filter((exercise) => stations.some((station) => station.id === exercise.stationId))
      return exercises.length > 0 && kept.length === 0 ? [] : [savedGroup(group, kept)]
    })
    .filter((group) => {
      const day = rotationGroupDay({ stations }, group)
      if (!day) return true
      const classes = event.classes.filter((item) => item.date === day)
      return classes.length === 0 || classes.some((item) => item.class === group.class)
    })

function StationsEditor({ event, disabled, onChange }: Props) {
  const { t } = useTranslation()
  const stations = useMemo(() => event.stations ?? [], [event.stations])
  const days = useMemo(() => getEventDays(event), [event])

  const stationsByDay = useMemo(() => {
    const byDay = new Map<string, EventStation[]>()
    for (const station of stations) {
      const day = station.date
      byDay.set(day, [...(byDay.get(day) ?? []), station])
    }
    return byDay
  }, [stations])

  // `stations` is an array, so a patch replaces it outright rather than merging by index — which is
  // what removal needs. The posts and the rotation always go together, so a removed post leaves no
  // group visiting it (KOE-1665).
  const setLayout = useCallback(
    (nextStations: EventStation[], nextRotations: EventRotationGroup[] = event.rotations ?? []) => {
      const stations = renumber(nextStations).map(savedStation)
      onChange?.({ rotations: savedRotations(event, nextRotations, stations), stations })
    },
    [event, onChange]
  )
  const setStations = useCallback((next: EventStation[]) => setLayout(next), [setLayout])
  const setRotations = useCallback((next: EventRotationGroup[]) => setLayout(stations, next), [setLayout, stations])

  const handleAdd = useCallback(
    (date: DayKey) => {
      const station: EventStation = {
        date,
        id: nanoid(10),
        number: (stationsByDay.get(date)?.length ?? 0) + 1,
        parts: 1,
      }
      setStations([...stations, station])
    },
    [setStations, stations, stationsByDay]
  )

  const handleChange = useCallback(
    (id: string, changes: Partial<EventStation>) =>
      setStations(stations.map((station) => (station.id === id ? { ...station, ...changes } : station))),
    [setStations, stations]
  )

  const handleRemove = useCallback(
    (id: string) => setStations(stations.filter((station) => station.id !== id)),
    [setStations, stations]
  )

  const rotates = scoresAtPosts(event.eventType)

  return (
    <Grid
      container
      spacing={2}
      sx={{
        maxWidth: 1280,
      }}
    >
      {days.map((day) => (
        <Box key={day} sx={{ width: '100%' }}>
          {days.length > 1 && (
            <Typography variant="subtitle2" component="h2" sx={{ mb: 0.5 }}>
              {t('dateFormat.wdshort', { date: day })}
            </Typography>
          )}
          <Grid container spacing={1}>
            {(stationsByDay.get(day) ?? []).map((station) => (
              <StationRow
                disabled={disabled}
                event={event}
                key={station.id}
                onChange={(changes) => handleChange(station.id, changes)}
                onRemove={() => handleRemove(station.id)}
                station={station}
              />
            ))}
            <Grid>
              <Button disabled={disabled} onClick={() => handleAdd(day)} startIcon={<AddOutlined />}>
                {t('event.stationAdd')}
              </Button>
            </Grid>
          </Grid>
          {/* A rotation decides where the dogs are scored, so only the types scored at posts have one. */}
          {rotates && (
            <RotationEditor
              day={day}
              disabled={disabled}
              event={event}
              heading={days.length > 1 ? 'h3' : 'h2'}
              onChange={setRotations}
            />
          )}
        </Box>
      ))}
    </Grid>
  )
}

export default memo(StationsEditor)
