import { SyntheticEvent, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import FormHelperText from '@mui/material/FormHelperText'
import Grid from '@mui/material/Grid'
import { sub } from 'date-fns'

import AutocompleteMulti from '../../../components/AutocompleteMulti'
import CollapsibleSection from '../../../components/CollapsibleSection'
import DateRange, { DateValue } from '../../../components/DateRange'
import { SectionProps } from '../EventForm'

import EventFormPlaces from './entrySection/EventFormPlaces'

interface Priority {
  group: string
  name: string
  value: string
}

const PRIORITY: Priority[] = [
  { group: 'Järjestävän yhdistyksen jäsen', name: 'Jäsen', value: 'member' },
  { group: 'Etusija nimetyillä roduilla', name: 'Kultaisetnoutajat', value: '111' },
  { group: 'Etusija nimetyillä roduilla', name: 'Labradorit', value: '122' },
  { group: 'Etusija nimetyillä roduilla', name: 'Sileäkarvaiset noutajat', value: '121' },
  { group: 'Etusija nimetyillä roduilla', name: 'Chesapeakenlahdennoutajat', value: '263' },
  { group: 'Etusija nimetyillä roduilla', name: 'Novascotiannoutajat', value: '312' },
  { group: 'Etusija nimetyillä roduilla', name: 'Kiharakarvaiset noutajat', value: '110' },
  { group: 'Järjestäjän kutsumat koirat', name: 'kutsutut', value: 'invited' },
]

export default function EntrySection(props: SectionProps) {
  const { t } = useTranslation()
  const { event, fields, helperTexts, onChange, onOpenChange, open } = props
  const error = helperTexts?.entryStartDate ?? helperTexts?.entryEndDate ?? helperTexts?.places
  const helperText = error ? t('validation.event.errors') : ''
  const eventPriority = useMemo(() => {
    const result: Priority[] = []
    for (const value of event.priority ?? []) {
      const priority = PRIORITY.find((p) => p.value === value)
      if (priority) {
        result.push(priority)
      }
    }
    return result
  }, [event.priority])

  const handleDateChange = useCallback(
    (start: DateValue, end: DateValue) =>
      onChange?.({ entryStartDate: start ?? undefined, entryEndDate: end ?? undefined }),
    [onChange]
  )
  const handlePriorityChange = useCallback(
    (e: SyntheticEvent<Element, Event>, value: Priority[]) => onChange?.({ priority: value.map((p) => p.value) }),
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
          <Grid item>
            <DateRange
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
          <Grid item>
            <EventFormPlaces {...props} />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            <AutocompleteMulti
              groupBy={(o) => o?.group ?? ''}
              isOptionEqualToValue={(o, v) => o?.value === v?.value}
              getOptionLabel={(o) => o?.name ?? ''}
              sx={{ width: 600 }}
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
