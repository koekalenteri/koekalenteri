import type { ChangeEvent } from 'react'
import type { DeepPartial, EventClass } from '../../../../../types'
import type { SectionProps } from '../types'

import { useCallback, useEffect, useState } from 'react'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { enqueueSnackbar } from 'notistack'

import { formatDate } from '../../../../../i18n/dates'
import {
  calculateTotalFromClasses,
  calculateTotalFromDays,
  distributePlacesAmongClasses,
  distributePlacesAmongDays,
  updatePlacesPerDayFromClasses,
} from '../../../../../lib/places'
import { compareEventClass } from '../components/EventClasses'

import ClassPlacesTable from './eventFormPlaces/ClassPlacesTable'
import DayPlacesTable from './eventFormPlaces/DayPlacesTable'

export default function EventFormPlaces({ event, disabled, helperTexts, onChange }: Readonly<SectionProps>) {
  const hasClasses = event.classes.length > 0
  const classPlaces = event.classes.reduce((total, c) => total + (c.places ?? 0), 0)
  const [totalEnabled, setTotalEnabled] = useState(
    (!event.placesPerDay || Object.keys(event.placesPerDay).length === 0) && classPlaces === 0
  )

  const handleChange = (c: DeepPartial<EventClass>, value?: number) => {
    const newClasses = event.classes.map((ec) => structuredClone(ec))
    const cls = newClasses.find((ec) => compareEventClass(ec, c) === 0)
    if (cls) {
      cls.places = Math.max(0, Math.min(value ?? 0, 200))
    }

    const total = calculateTotalFromClasses(newClasses)

    // Update placesPerDay based on classes
    const newPlacesPerDay = !totalEnabled ? updatePlacesPerDayFromClasses({ ...event, classes: newClasses }) : {}

    onChange?.({
      classes: newClasses,
      places: total > 0 ? total : event.places,
      placesPerDay: newPlacesPerDay,
    })
  }

  const handlePlacesChange = useCallback(
    (value?: number) => onChange?.({ places: Math.min(Math.max(value ?? 0, 0), 999), placesPerDay: {} }),
    [onChange]
  )

  const handleDayPlacesChange = useCallback(
    (date: Date, value?: number) => {
      const dateStr = formatDate(date, 'yyyy-MM-dd')
      const newPlacesPerDay = { ...(event.placesPerDay ?? {}) }

      if (value && value > 0) {
        newPlacesPerDay[dateStr] = Math.min(Math.max(value ?? 0, 0), 200)
      } else {
        delete newPlacesPerDay[dateStr]
      }

      const total = calculateTotalFromDays(newPlacesPerDay)
      onChange?.({ placesPerDay: newPlacesPerDay, places: total })
    },
    [event.places, event.placesPerDay, onChange]
  )

  const handleDetailedChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      setTotalEnabled(!checked)

      if (hasClasses) {
        // For events with classes
        const newClasses = event.classes.map((ec) => structuredClone(ec))

        if (checked) {
          // Distribute places among classes
          const distributedClasses = distributePlacesAmongClasses(newClasses, event.places ?? 0)
          distributedClasses.forEach((cls, i) => {
            newClasses[i].places = cls.places
          })

          // Update placesPerDay based on classes
          const newPlacesPerDay = updatePlacesPerDayFromClasses({ ...event, classes: newClasses })

          onChange?.({
            classes: newClasses,
            placesPerDay: newPlacesPerDay,
          })
        } else {
          // Reset class places
          newClasses.forEach((cls) => (cls.places = 0))
          onChange?.({ classes: newClasses, placesPerDay: {} })
        }
      } else if (checked && (!event.placesPerDay || Object.keys(event.placesPerDay).length === 0)) {
        // Initialize placesPerDay with even distribution
        const placesPerDay = distributePlacesAmongDays(event)
        if (Object.keys(placesPerDay).length > 0) {
          onChange?.({ placesPerDay })
        }
      } else if (!checked) {
        // Reset placesPerDay
        onChange?.({ placesPerDay: {} })
      }
    },
    [event, hasClasses, onChange]
  )

  // Fix places count
  useEffect(() => {
    if (!totalEnabled) {
      let total = 0

      if (hasClasses) {
        // Calculate total from classes
        total = calculateTotalFromClasses(event.classes)
      } else if (event.placesPerDay) {
        // Calculate total from placesPerDay
        total = calculateTotalFromDays(event.placesPerDay)
      }

      if (total !== event.places) {
        onChange?.({ places: total })
        enqueueSnackbar(`Korjaus: Koepaikkojen määrä muutettu ${event.places} -> ${total}`, { variant: 'info' })
      }
    }
  }, [event.id])

  return (
    <Box sx={{ p: 1, border: '1px dashed #ddd', borderRadius: 1 }}>
      <Stack direction="column" alignItems="normal">
        <Stack direction="row" justifyContent="space-between" alignItems="start">
          <Typography variant="subtitle1">Koepaikkojen määrä</Typography>
          <FormControlLabel
            sx={{ m: 0 }}
            disabled={disabled}
            control={<Checkbox sx={{ py: 0 }} size="small" checked={!totalEnabled} onChange={handleDetailedChange} />}
            label="Eriteltynä"
            name="detailedPlaces"
          />
        </Stack>

        {hasClasses ? (
          <ClassPlacesTable
            event={event}
            disabled={!!disabled}
            classesEnabled={!totalEnabled}
            handleChange={handleChange}
            handlePlacesChange={handlePlacesChange}
          />
        ) : (
          <DayPlacesTable
            event={event}
            disabled={!!disabled}
            handleDayPlacesChange={handleDayPlacesChange}
            handlePlacesChange={handlePlacesChange}
            totalEnabled={totalEnabled}
          />
        )}

        <FormHelperText error>{helperTexts?.places}</FormHelperText>
      </Stack>
    </Box>
  )
}
