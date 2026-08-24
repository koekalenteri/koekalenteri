import type { MouseEvent } from 'react'
import type { DeepPartial, EventClass } from '../../../../../types'
import type { EntryEvent, SectionProps } from '../types'
import Box from '@mui/material/Box'
import FormHelperText from '@mui/material/FormHelperText'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../../../../i18n/dates'
import { getEventDays } from '../../../../../lib/event'
import { compareEventClass } from '../components/EventClasses'
import {
  calculateTotalFromClasses,
  calculateTotalFromDays,
  distributePlacesAmongClasses,
  distributePlacesAmongClassesPerDay,
  distributePlacesAmongDays,
  requiresClassPlaces,
  updatePlacesPerDayFromClasses,
} from '../places'
import ClassPlacesTable from './eventFormPlaces/ClassPlacesTable'
import DayPlacesTable from './eventFormPlaces/DayPlacesTable'
import TotalPlacesField from './eventFormPlaces/TotalPlacesField'

type PlacesMode = 'total' | 'perDay' | 'perClass'

interface Props extends Pick<SectionProps, 'disabled' | 'helperTexts' | 'onChange'> {
  readonly event: EntryEvent
}

// "Per day" only makes sense as a distinct choice from "total" when the event spans more
// than one day — for a single-day event the two are the same number, so it's hidden.
function inferPlacesMode(
  classPlaces: number,
  placesPerDay: EntryEvent['placesPerDay'],
  isMultiDay: boolean
): PlacesMode {
  if (classPlaces > 0) return 'perClass'
  if (isMultiDay && placesPerDay && Object.keys(placesPerDay).length > 0) return 'perDay'
  return 'total'
}

export default function EventFormPlaces({ event, disabled, helperTexts, onChange }: Readonly<Props>) {
  const { t } = useTranslation()
  const hasClasses = event.classes.length > 0
  const isMultiDay = getEventDays(event).length > 1
  const classPlaces = calculateTotalFromClasses(event.classes)
  const [mode, setMode] = useState<PlacesMode>(() => inferPlacesMode(classPlaces, event.placesPerDay, isMultiDay))

  // A saved NOME-B trial that already has class-specific places locks into per-class mode, so
  // switching away can't silently discard the per-class breakdown the event already relies on.
  const locked = requiresClassPlaces(event) && !!event.createdAt && classPlaces > 0

  const handleClassChange = (c: DeepPartial<EventClass>, value?: number) => {
    const newClasses = event.classes.map((ec) => structuredClone(ec))
    const cls = newClasses.find((ec) => compareEventClass(ec, c) === 0)
    if (cls) {
      cls.places = Math.max(0, Math.min(value ?? 0, 200))
    }

    onChange?.({
      classes: newClasses,
      places: calculateTotalFromClasses(newClasses),
      placesPerDay: updatePlacesPerDayFromClasses({ ...event, classes: newClasses }),
    })
  }

  const handleDayChange = useCallback(
    (date: Date, value?: number) => {
      const dateStr = formatDate(date, 'yyyy-MM-dd')
      const newPlacesPerDay = event.placesPerDay ? { ...event.placesPerDay } : {}

      if (value && value > 0) {
        newPlacesPerDay[dateStr] = Math.min(Math.max(value, 0), 200)
      } else {
        delete newPlacesPerDay[dateStr]
      }

      onChange?.({ places: calculateTotalFromDays(newPlacesPerDay), placesPerDay: newPlacesPerDay })
    },
    [event.placesPerDay, onChange]
  )

  const handleTotalChange = useCallback(
    (value?: number) => onChange?.({ places: Math.min(Math.max(value ?? 0, 0), 999) }),
    [onChange]
  )

  const handleModeChange = useCallback(
    (_e: MouseEvent<HTMLElement>, newMode: PlacesMode | null) => {
      if (newMode === null || newMode === mode) return
      setMode(newMode)

      const zeroedClasses = () => event.classes.map((c) => ({ ...c, places: 0 }))

      if (newMode === 'total') {
        onChange?.({
          placesPerDay: null,
          ...(hasClasses ? { classes: zeroedClasses() } : {}),
        })
      } else if (newMode === 'perDay') {
        const placesPerDay =
          mode === 'perClass' ? updatePlacesPerDayFromClasses(event) : distributePlacesAmongDays(event)
        onChange?.({
          placesPerDay,
          ...(hasClasses ? { classes: zeroedClasses() } : {}),
        })
      } else {
        const classes =
          mode === 'perDay'
            ? distributePlacesAmongClassesPerDay(event.classes, event.placesPerDay ?? {})
            : distributePlacesAmongClasses(event.classes, event.places ?? 0)
        onChange?.({ classes })
      }
    },
    [event, hasClasses, mode, onChange]
  )

  // Keep `places` in sync with the mode's source of truth (classes or placesPerDay) — e.g.
  // after loading an event whose data drifted from an earlier bug or a direct API edit.
  useEffect(() => {
    if (mode === 'total') return

    const total =
      mode === 'perClass' ? calculateTotalFromClasses(event.classes) : calculateTotalFromDays(event.placesPerDay)

    if (total !== event.places) {
      onChange?.({ places: total })
      enqueueSnackbar(`Korjaus: Koepaikkojen määrä muutettu ${event.places} -> ${total}`, { variant: 'info' })
    }
  }, [event.classes, event.places, event.placesPerDay, mode, onChange])

  return (
    <Box sx={{ border: '1px dashed #ddd', borderRadius: 1, p: 1 }}>
      <Stack direction="column" alignItems="normal">
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={1}>
          <Typography variant="subtitle1">{t('event.placesEditor.title')}</Typography>
          <ToggleButtonGroup exclusive size="small" disabled={disabled} value={mode} onChange={handleModeChange}>
            <ToggleButton
              value="total"
              disabled={disabled || locked}
              title={locked ? t('event.placesEditor.locked') : undefined}
            >
              {t('event.placesEditor.total')}
            </ToggleButton>
            {isMultiDay && (
              <ToggleButton
                value="perDay"
                disabled={disabled || locked}
                title={locked ? t('event.placesEditor.locked') : undefined}
              >
                {t('event.placesEditor.perDay')}
              </ToggleButton>
            )}
            {hasClasses && <ToggleButton value="perClass">{t('event.placesEditor.perClass')}</ToggleButton>}
          </ToggleButtonGroup>
        </Stack>

        {mode === 'total' && (
          <TotalPlacesField disabled={!!disabled} value={event.places} onChange={handleTotalChange} />
        )}
        {mode === 'perDay' && (
          <DayPlacesTable event={event} disabled={!!disabled} handleDayPlacesChange={handleDayChange} />
        )}
        {mode === 'perClass' && (
          <ClassPlacesTable event={event} disabled={!!disabled} handleChange={handleClassChange} />
        )}

        <FormHelperText error>{helperTexts?.places}</FormHelperText>
      </Stack>
    </Box>
  )
}
