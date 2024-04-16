import type { SyntheticEvent } from 'react'
import type { Priority } from '../../../../lib/priority'
import type { RegistrationClass } from '../../../../types'
import type { DateValue } from '../../../components/DateRange'
import type { SectionProps } from '../EventForm'

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import FormHelperText from '@mui/material/FormHelperText'
import Grid from '@mui/material/Grid'
import { endOfDay, startOfDay, sub } from 'date-fns'

import { PRIORITY, priorityValuesToPriority } from '../../../../lib/priority'
import AutocompleteMulti from '../../../components/AutocompleteMulti'
import CollapsibleSection from '../../../components/CollapsibleSection'
import DateRange from '../../../components/DateRange'

import { EventDates } from './entrySection/EventDates'
import EventFormPlaces from './entrySection/EventFormPlaces'

export interface Props extends Readonly<SectionProps> {
  readonly eventTypeClasses?: RegistrationClass[]
}

export default function EntrySection(props: Props) {
  const { t } = useTranslation()
  const { disabled, event, eventTypeClasses, fields, helperTexts, onChange, onOpenChange, open } = props
  const error = helperTexts?.entryStartDate ?? helperTexts?.entryEndDate ?? helperTexts?.places
  const helperText = error ? t('validation.event.errors') : ''
  const eventPriority = useMemo(() => priorityValuesToPriority(event.priority), [event.priority])

  const handleDateChange = useCallback(
    (start: DateValue, end: DateValue) =>
      onChange?.({
        entryStartDate: start ? startOfDay(start) : undefined,
        entryEndDate: end ? endOfDay(end) : undefined,
      }),
    [onChange]
  )
  const handlePriorityChange = useCallback(
    (e: SyntheticEvent<Element, Event>, value: readonly Priority[]) =>
      onChange?.({ priority: value.map((p) => p.value) }),
    [onChange]
  )

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
              groupBy={(o) => o?.group ?? ''}
              isOptionEqualToValue={(o, v) => o?.value === v?.value}
              getOptionLabel={(o) => o?.name ?? ''}
              options={PRIORITY}
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
