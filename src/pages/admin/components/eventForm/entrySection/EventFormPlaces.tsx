import type { ChangeEvent } from 'react'
import type { DeepPartial, EventClass } from '../../../../../types'
import type { SectionProps } from '../../EventForm'

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import Stack from '@mui/material/Stack'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'

import { getEventClassesByDays, getUniqueEventClasses } from '../../../../../lib/event'
import { compareEventClass } from '../components/EventClasses'

import PlacesDisplay from './eventFormPlaces/PlacesDisplay'
import PlacesInput from './eventFormPlaces/PlacesInput'

export default function EventFormPlaces({ event, disabled, helperTexts, onChange }: Readonly<SectionProps>) {
  const { t } = useTranslation()
  const [classesEnabled, setClassesEnabled] = useState(
    event.classes?.reduce((prev, cur) => prev + (cur?.places ?? 0), 0) > 0
  )
  const uniqueClasses = getUniqueEventClasses(event)
  const classesByDays = getEventClassesByDays(event)

  const handleChange = (c: DeepPartial<EventClass>) => (value: number) => {
    const newClasses = event.classes.map((ec) => structuredClone(ec))
    const cls = newClasses.find((ec) => compareEventClass(ec, c) === 0)
    if (cls) {
      cls.places = Math.max(0, Math.min(value, 200))
    }
    const total = newClasses.reduce((prev, cur) => prev + (cur?.places ?? 0), 0)
    onChange?.({ classes: newClasses, places: total ? total : event.places })
  }

  const handlePlacesChange = useCallback(
    (value: number) => onChange?.({ places: Math.min(Math.max(value, 0), 999) }),
    [onChange]
  )

  const handleByClassesChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      setClassesEnabled(checked)
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
            disabled={disabled}
            control={<Checkbox sx={{ py: 0 }} size="small" checked={classesEnabled} onChange={handleByClassesChange} />}
            label="Luokittain"
            name="classesEnabled"
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
                    {t('dateFormat.wdshort', { date: day })}
                  </TableCell>
                  {uniqueClasses.map((c) => {
                    const cls = classes.find((cl) => cl.class === c)
                    dayTotal += cls?.places ?? 0
                    return (
                      <TableCell key={c} align="center">
                        {cls ? (
                          <PlacesInput
                            disabled={disabled || !classesEnabled}
                            value={cls.places}
                            onChange={handleChange(cls)}
                          />
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
                      .reduce((prev, cur) => prev + (cur?.places ?? 0), 0)}
                  />
                </TableCell>
              ))}
              <TableCell align="center">
                <PlacesInput
                  id="event.places"
                  disabled={disabled || classesEnabled}
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
