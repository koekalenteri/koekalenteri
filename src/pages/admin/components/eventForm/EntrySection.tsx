import type { SyntheticEvent } from 'react'
import type { Priority } from '../../../../lib/priority'
import type { EventClass, RegistrationClass } from '../../../../types'
import type { DateValue } from '../../../components/DateRange'
import type { SectionProps } from '../EventForm'

import { useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import FormHelperText from '@mui/material/FormHelperText'
import Grid from '@mui/material/Grid'
import { clamp, sub } from 'date-fns'
import { enqueueSnackbar } from 'notistack'

import { zonedEndOfDay, zonedStartOfDay } from '../../../../i18n/dates'
import { getPrioritySort, PRIORITY, priorityValuesToPriority } from '../../../../lib/priority'
import AutocompleteMulti from '../../../components/AutocompleteMulti'
import CollapsibleSection from '../../../components/CollapsibleSection'
import DateRange from '../../../components/DateRange'

import { EventDates } from './entrySection/EventDates'
import EventFormPlaces from './entrySection/EventFormPlaces'

export interface Props extends Readonly<SectionProps> {
  readonly eventTypeClasses?: RegistrationClass[]
}

export default function EntrySection(props: Props) {
  const { t } = useTranslation(['translation', 'breed'])
  const { disabled, event, eventTypeClasses, fields, helperTexts, onChange, onOpenChange, open } = props
  const prioritySort = getPrioritySort(t)
  const error = helperTexts?.entryStartDate ?? helperTexts?.entryEndDate ?? helperTexts?.places
  const helperText = error ? t('validation.event.errors') : ''
  const eventPriority = useMemo(
    () => priorityValuesToPriority(event.priority).sort(prioritySort),
    [event.priority, prioritySort]
  )
  const sortedPriorities = useMemo(() => PRIORITY.slice().sort(prioritySort), [prioritySort])

  const handleDateChange = useCallback(
    (start: DateValue, end: DateValue) =>
      onChange?.({
        entryStartDate: start ? zonedStartOfDay(start) : undefined,
        entryEndDate: end ? zonedEndOfDay(end) : undefined,
      }),
    [onChange]
  )
  const handlePriorityChange = useCallback(
    (e: SyntheticEvent<Element, Event>, value: readonly Priority[]) =>
      onChange?.({ priority: value.map((p) => p.value) }),
    [onChange]
  )

  useEffect(() => {
    // KOE-808 make sure classes are inside event dates
    if (!event.classes.some((c) => c.date < event.startDate || c.date > event.endDate)) return

    const newClasses: EventClass[] = []
    const interval = { start: event.startDate, end: event.endDate }
    for (const cls of event.classes) {
      if (cls.date < interval.start || cls.date > interval.end) {
        const date = clamp(cls.date, interval)
        newClasses.push({ ...cls, date })
        enqueueSnackbar(
          `Korjaus: ${cls.class}/${t('dateFormat.wdshort', { date: cls.date })} siirretty ${cls.class}/${t('dateFormat.wdshort', { date })}`,
          { variant: 'info' }
        )
      } else {
        newClasses.push(cls)
      }
    }
    onChange?.({ classes: newClasses })
  }, [event.classes, event.endDate, event.startDate, onChange, t])

  return (
    <CollapsibleSection
      title="Ilmoittautuminen"
      open={open}
      onOpenChange={onOpenChange}
      error={!!error}
      helperText={helperText}
    >
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item width={600}>
            <DateRange
              disabled={disabled}
              startLabel="Ilmoittautumisaika alkaa"
              endLabel="Ilmoittautumisaika päättyy"
              start={event.entryStartDate ?? null}
              defaultStart={sub(event.startDate, { weeks: 6 })}
              end={event.entryEndDate ?? null}
              defaultEnd={sub(event.startDate, { weeks: 3 })}
              range={{ start: event.createdAt ?? sub(event.startDate, { weeks: 9 }), end: event.startDate }}
              required={fields?.required.entryStartDate ?? fields?.required.entryEndDate}
              onChange={handleDateChange}
            />
            <FormHelperText error>{helperTexts?.entryStartDate ?? helperTexts?.entryEndDate}</FormHelperText>
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item minWidth={600} maxWidth={900}>
            <EventDates event={event} eventTypeClasses={eventTypeClasses} onChange={onChange} />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item width={600}>
            <EventFormPlaces disabled={disabled} {...props} />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item minWidth={600} maxWidth={900}>
            <AutocompleteMulti
              disabled={disabled}
              disablePortal
              groupBy={(o) => t(o.group)}
              isOptionEqualToValue={(o, v) => o?.value === v?.value}
              getOptionLabel={(o) => t(o.name)}
              options={sortedPriorities}
              onChange={handlePriorityChange}
              value={eventPriority}
              label={'Etusijat'}
            />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
