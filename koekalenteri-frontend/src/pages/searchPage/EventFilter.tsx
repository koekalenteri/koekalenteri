import { SyntheticEvent, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, FormControlLabel, Grid, Stack, Switch } from '@mui/material'
import { Judge, Organizer } from 'koekalenteri-shared/model'

import AutocompleteMulti from '../components/AutocompleteMulti'
import DateRange, { DateValue } from '../components/DateRange'
import { FilterProps } from '../recoil'

interface Props {
  eventTypes: string[]
  eventClasses: string[]
  filter: FilterProps
  judges: Judge[]
  onChange?: (filter: FilterProps) => void
  organizers: Organizer[]
}

const MIN_DATE = new Date(2020, 0, 1)

export const EventFilter = ({ judges, organizers, eventTypes, eventClasses, filter, onChange }: Props) => {
  const { t } = useTranslation()
  const setFilter = useCallback(
    (props: Partial<FilterProps>) => onChange && onChange({ ...filter, ...props }),
    [filter, onChange]
  )
  const handleDateRangeChange = useCallback(
    (start: DateValue, end: DateValue) => setFilter({ start, end }),
    [setFilter]
  )
  const handleEventTypeChange = useCallback(
    (event: SyntheticEvent<Element, Event>, value: string[]) => setFilter({ eventType: value }),
    [setFilter]
  )
  const handleEventClassChange = useCallback(
    (event: SyntheticEvent<Element, Event>, value: string[]) => setFilter({ eventClass: value }),
    [setFilter]
  )
  const handleOrganizerChange = useCallback(
    (event: SyntheticEvent<Element, Event>, value: Organizer[]) => setFilter({ organizer: value.map((v) => +v.id) }),
    [setFilter]
  )
  const handleJudgeChange = useCallback(
    (event: SyntheticEvent<Element, Event>, value: Judge[]) => setFilter({ judge: value.map((v) => +v.id) }),
    [setFilter]
  )
  const handleWithEntryOpenChange = useCallback(
    (event: SyntheticEvent<Element, Event>, checked: boolean) =>
      setFilter({
        withOpenEntry: checked,
        withClosingEntry: checked && filter.withClosingEntry,
        withFreePlaces: checked && filter.withFreePlaces,
      }),
    [filter.withClosingEntry, filter.withFreePlaces, setFilter]
  )
  const handleWithUpcomingEntryChange = useCallback(
    (event: SyntheticEvent<Element, Event>, checked: boolean) =>
      setFilter({
        withUpcomingEntry: checked,
      }),
    [setFilter]
  )
  const getName = useCallback((o?: { name?: string }) => o?.name ?? '', [])
  const getString = useCallback((o?: string) => o ?? '', [])
  const compareId = useCallback((o?: { id?: number }, v?: { id?: number }) => o?.id === v?.id, [])

  return (
    <Box m={1}>
      <Grid container justifyContent="start" spacing={1}>
        <Grid item xs={12} md={6}>
          <DateRange
            start={filter.start}
            end={filter.end}
            range={{ start: MIN_DATE }}
            startLabel={t('daterangeStart')}
            endLabel={t('daterangeEnd')}
            onChange={handleDateRangeChange}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <AutocompleteMulti
            getOptionLabel={getString}
            label={t('eventType')}
            onChange={handleEventTypeChange}
            options={eventTypes}
            value={filter.eventType}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2}>
          <AutocompleteMulti
            getOptionLabel={getString}
            label={t('eventClass')}
            onChange={handleEventClassChange}
            options={eventClasses}
            value={filter.eventClass}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <AutocompleteMulti
            getOptionLabel={getName}
            isOptionEqualToValue={compareId}
            label={t('organizer')}
            onChange={handleOrganizerChange}
            options={organizers}
            value={organizers.filter((o) => filter.organizer.includes(o.id))}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <AutocompleteMulti
            getOptionLabel={getName}
            isOptionEqualToValue={compareId}
            label={t('judge')}
            onChange={handleJudgeChange}
            options={judges}
            value={judges.filter((j) => filter.judge.includes(j.id))}
          />
        </Grid>
        <Grid item md={12}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0} alignItems="start" justifyContent="start">
            <FormControlLabel
              value="withOpenEntry"
              checked={filter.withOpenEntry}
              control={<Switch />}
              label={t('entryOpen')}
              onChange={handleWithEntryOpenChange}
            />
            <FormControlLabel
              value="withUpcomingEntry"
              checked={filter.withUpcomingEntry}
              control={<Switch />}
              label={t('entryUpcoming')}
              labelPlacement="end"
              onChange={handleWithUpcomingEntryChange}
            />
          </Stack>
        </Grid>
      </Grid>
    </Box>
  )
}
