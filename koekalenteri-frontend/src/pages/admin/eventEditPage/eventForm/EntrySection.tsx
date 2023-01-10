import { ChangeEvent, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox, FormControlLabel, FormHelperText, Grid } from '@mui/material'
import { sub } from 'date-fns'

import CollapsibleSection from '../../../components/CollapsibleSection'
import DateRange, { DateValue } from '../../../components/DateRange'
import { SectionProps } from '../EventForm'

import EventFormPlaces from './entrySection/EventFormPlaces'

export default function EntrySection(props: SectionProps) {
  const { t } = useTranslation()
  const { event, fields, helperTexts, onChange, onOpenChange, open } = props
  const error = helperTexts?.entryStartDate || helperTexts?.entryEndDate || helperTexts?.places
  const helperText = error ? t('validation.event.errors') : ''
  const handleDateChange = useCallback((start: DateValue, end: DateValue) => onChange?.({entryStartDate: start || undefined, entryEndDate: end || undefined}), [onChange])
  const handleOwnerMembershipChange = useCallback((e: ChangeEvent<HTMLInputElement>) => onChange?.({ allowOwnerMembershipPriority: e.target.checked }), [onChange])
  const handleHandlerMembershipChange = useCallback((e: ChangeEvent<HTMLInputElement>) => onChange?.({ allowHandlerMembershipPriority: e.target.checked }), [onChange])

  return (
    <CollapsibleSection title="Ilmoittautuminen" open={open} onOpenChange={onOpenChange} error={!!error} helperText={helperText}>
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item>
            <DateRange
              startLabel="Ilmoittautumisaika alkaa"
              endLabel="Ilmoittautumisaika päättyy"
              start={event.entryStartDate || null}
              defaultStart={sub(event.startDate, {weeks: 6})}
              end={event.entryEndDate || null}
              defaultEnd={sub(event.startDate, { weeks: 3 })}
              range={{start: event.createdAt || sub(event.startDate, {weeks: 9}), end: event.startDate}}
              required={fields?.required.entryStartDate || fields?.required.entryEndDate}
              onChange={handleDateChange}
            />
            <FormHelperText error>{helperTexts?.entryStartDate || helperTexts?.entryEndDate}</FormHelperText>
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            Koepaikkojen määrä
            <EventFormPlaces {...props} />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            <FormControlLabel
              control={
                <Checkbox
                  checked={!!event.allowOwnerMembershipPriority}
                  onChange={handleOwnerMembershipChange}
                />
              }
              label="Omistaja jäsenet etusijalla"
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={!!event.allowHandlerMembershipPriority}
                  onChange={handleHandlerMembershipChange}
                />
              }
              label="Ohjaaja jäsenet etusijalla"
            />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
