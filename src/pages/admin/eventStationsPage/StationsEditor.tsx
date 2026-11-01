import type { DayKey, DogEvent, EventRotationGroup, EventStation, Patch } from '@/types'
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
import { rotationGroupDay, stationParts } from '@/lib/rotation'
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
 * `tasks` read once and dropped, and a default task count of one left out.
 */
const savedStation = ({ tasks, taskCount, ...station }: EventStation): EventStation => ({
  ...station,
  parts: stationParts({ parts: station.parts, tasks }),
  ...(taskCount && taskCount > 1 ? { taskCount } : {}),
})

/**
 * The groups as this page saves them. A visit to a removed post goes, and so does a group left with no
 * visit or whose class no longer runs on the day of its posts.
 */
const savedRotations = (event: StationsEditorEvent, rotations: EventRotationGroup[], stations: EventStation[]) =>
  rotations
    .map((group) => {
      const posts = group.posts.filter((post) => stations.some((station) => station.id === post.stationId))
      return posts.length === group.posts.length ? group : { ...group, posts }
    })
    .filter((group) => {
      if (group.posts.length === 0) return false
      const day = rotationGroupDay({ stations }, group)
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
