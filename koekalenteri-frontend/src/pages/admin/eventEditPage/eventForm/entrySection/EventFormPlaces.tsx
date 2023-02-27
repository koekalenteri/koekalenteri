import { ChangeEvent, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Box,
  Checkbox,
  FormControlLabel,
  FormHelperText,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import { eachDayOfInterval, isSameDay } from 'date-fns'
import { DeepPartial, EventClass } from 'koekalenteri-shared/model'

import { unique } from '../../../../../utils'
import { SectionProps } from '../../EventForm'
import { compareEventClass } from '../components/EventClasses'

import PlacesDisplay from './eventFormPlaces/PlacesDisplay'
import PlacesInput from './eventFormPlaces/PlacesInput'

export default function EventFormPlaces({ event, helperTexts, onChange }: SectionProps) {
  const { t } = useTranslation()
  const [classesEnabled, setClassesEnalbed] = useState(
    event.classes?.reduce((prev, cur) => prev + (cur?.places || 0), 0) > 0
  )
  const days = eachDayOfInterval({
    start: event.startDate,
    end: event.endDate,
  })
  const uniqueClasses = unique(event.classes.map((c) => c.class))
  const classesByDays = days.map((day) => ({
    day,
    classes: event.classes.filter((c) => isSameDay(c.date || event.startDate, day)),
  }))

  const handleChange = (c: DeepPartial<EventClass>) => (value: number) => {
    const newClasses = event.classes.map((ec) => structuredClone(ec))
    const cls = newClasses.find((ec) => compareEventClass(ec, c) === 0)
    if (cls) {
      cls.places = Math.max(0, Math.min(value, 200))
    }
    const total = newClasses.reduce((prev, cur) => prev + (cur?.places || 0), 0)
    onChange?.({ classes: newClasses, places: total ? total : event.places })
  }

  const handlePlacesChange = useCallback(
    (value: number) => onChange?.({ places: Math.min(Math.max(value, 0), 999) }),
    [onChange]
  )

  const handleByClassesChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      setClassesEnalbed(checked)
      const newClasses = event.classes.map((ec) => structuredClone(ec))
      const count = newClasses.length
      for (let diff = event.places ?? 0, i = 0; i < count; i++) {
        const classValue = checked ? Math.min(Math.max(Math.round(diff / (count - i)), 0), 200) : 0
        newClasses[i].places = classValue
        diff -= classValue
      }
      onChange?.({ classes: newClasses })
    },
    [event.classes, event.places, onChange]
  )

  return (
    <Box sx={{ p: 1, border: '1px dashed #ddd', borderRadius: 1 }}>
      <Stack direction="column" alignItems="normal">
        <Stack direction="row" justifyContent="space-between" alignItems="start">
          <Typography variant="subtitle1">Koepaikkojen määrä</Typography>
          <FormControlLabel
            sx={{ m: 0 }}
            control={<Checkbox sx={{ py: 0 }} size="small" checked={classesEnabled} onChange={handleByClassesChange} />}
            label="Luokittain"
          />
        </Stack>
        <Table size="small" sx={{ '& .MuiTextField-root': { m: 0, width: '10ch' } }}>
          <TableHead>
            <TableRow>
              <TableCell>{t('date')}</TableCell>
              {uniqueClasses.map((c) => (
                <TableCell key={`head${c}`} align="center">
                  {c}
                </TableCell>
              ))}
              <TableCell align="center">Yhteensä</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {classesByDays.map(({ day, classes }) => {
              let dayTotal = 0
              return (
                <TableRow key={day.toISOString()}>
                  <TableCell component="th" scope="row">
                    {t('dateshort', { date: day })}
                  </TableCell>
                  {uniqueClasses.map((c) => {
                    const cls = classes.find((cl) => cl.class === c)
                    dayTotal += cls?.places || 0
                    return (
                      <TableCell key={c} align="center">
                        {cls ? (
                          <PlacesInput disabled={!classesEnabled} value={cls.places} onChange={handleChange(cls)} />
                        ) : (
                          ''
                        )}
                      </TableCell>
                    )
                  })}
                  <TableCell align="center">
                    <PlacesDisplay value={dayTotal} />
                  </TableCell>
                </TableRow>
              )
            })}
            <TableRow>
              <TableCell component="th" scope="row">
                Yhteensä
              </TableCell>
              {uniqueClasses.map((c) => (
                <TableCell key={c} align="center">
                  <PlacesDisplay
                    value={event.classes
                      .filter((ec) => ec.class === c)
                      .reduce((prev, cur) => prev + (cur?.places || 0), 0)}
                  />
                </TableCell>
              ))}
              <TableCell align="center">
                <PlacesInput
                  id="event.places"
                  disabled={classesEnabled}
                  value={event.places}
                  onChange={handlePlacesChange}
                />
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <FormHelperText error>{helperTexts?.places}</FormHelperText>
      </Stack>
    </Box>
  )
}
