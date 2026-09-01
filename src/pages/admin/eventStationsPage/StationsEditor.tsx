import type { DogEvent, EventStation, Patch } from '../../../types'
import AddOutlined from '@mui/icons-material/AddOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Typography from '@mui/material/Typography'
import { nanoid } from 'nanoid'
import { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { zonedDateString } from '../../../i18n/dates'
import { getEventDays } from '../../../lib/event'
import { StationRow } from './StationRow'

export type StationsEditorEvent = Pick<DogEvent, 'endDate' | 'eventType' | 'judges' | 'startDate' | 'stations'>

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
    const day = zonedDateString(station.date)
    const number = (perDay.get(day) ?? 0) + 1
    perDay.set(day, number)

    return station.number === number ? station : { ...station, number }
  })
}

function StationsEditor({ event, disabled, onChange }: Props) {
  const { t } = useTranslation()
  const stations = useMemo(() => event.stations ?? [], [event.stations])
  const days = useMemo(() => getEventDays(event), [event])

  const stationsByDay = useMemo(() => {
    const byDay = new Map<string, EventStation[]>()
    for (const station of stations) {
      const day = zonedDateString(station.date)
      byDay.set(day, [...(byDay.get(day) ?? []), station])
    }
    return byDay
  }, [stations])

  // `stations` is an array, so a patch replaces it outright rather than merging by index — which is
  // what removal needs.
  const setStations = useCallback((next: EventStation[]) => onChange?.({ stations: renumber(next) }), [onChange])

  const handleAdd = useCallback(
    (date: Date) => {
      const station: EventStation = {
        date,
        id: nanoid(10),
        number: (stationsByDay.get(zonedDateString(date))?.length ?? 0) + 1,
        tasks: 1,
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

  return (
    <Grid container spacing={2} maxWidth={1280}>
      {days.map((day) => (
        <Box key={zonedDateString(day)} sx={{ width: '100%' }}>
          {days.length > 1 && (
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
              {t('dateFormat.wdshort', { date: day })}
            </Typography>
          )}
          <Grid container spacing={1}>
            {(stationsByDay.get(zonedDateString(day)) ?? []).map((station) => (
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
        </Box>
      ))}
    </Grid>
  )
}

export default memo(StationsEditor)
