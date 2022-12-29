import { useTranslation } from 'react-i18next'
import { Box, FormControlLabel, Grid, Stack, Switch } from '@mui/material'
import { formatISO } from 'date-fns'
import { Judge, Organizer } from 'koekalenteri-shared/model'

import { FilterProps } from '../pages/recoil/events'

import { AutocompleteMulti, DateRange } from '.'

type EventFilterProps = {
  eventTypes: string[]
  filter: FilterProps
  judges: Judge[]
  onChange?: (filter: FilterProps) => void
  organizers: Organizer[]
}

const MIN_DATE = new Date(2020, 0, 1)

const readDate = (date: string | null) => date ? new Date(date) : null
const writeDate = (date: Date | null) => date ? formatISO(date, { representation: 'date' }) : ''

export function serializeFilter(input: unknown): string {
  const {eventFilter} = input as {eventFilter: FilterProps}
  const params = new URLSearchParams()
  const bits = []
  if (eventFilter.withClosingEntry) {
    bits.push('c')
  }
  if (eventFilter.withFreePlaces) {
    bits.push('f')
  }
  if (eventFilter.withOpenEntry) {
    bits.push('o')
  }
  if (eventFilter.withUpcomingEntry) {
    bits.push('u')
  }
  if (eventFilter.end) {
    params.append('e', writeDate(eventFilter.end))
  }
  eventFilter.eventClass.forEach(v => params.append('c', v))
  eventFilter.eventType.forEach(v => params.append('t', v))
  eventFilter.judge.forEach(v => params.append('j', v.toString()))
  eventFilter.organizer.forEach(v => params.append('o', v.toString()))
  bits.forEach(v => params.append('b', v))
  return params.toString()
}

export function deserializeFilter(input: string): unknown {
  const searchParams = new URLSearchParams(input)
  const bits = searchParams.getAll('b')
  const result: FilterProps = {
    end: readDate(searchParams.get('e')),
    eventClass: searchParams.getAll('c'),
    eventType: searchParams.getAll('t'),
    judge: searchParams.getAll('j').map(j => parseInt(j)),
    organizer: searchParams.getAll('o').map(s => parseInt(s)),
    start: readDate(searchParams.get('s')),
    withClosingEntry: bits.includes('c'),
    withFreePlaces: bits.includes('f'),
    withOpenEntry: bits.includes('o'),
    withUpcomingEntry: bits.includes('u'),
  }
  return result
}

export const EventFilter = ({ judges, organizers, eventTypes, filter, onChange }: EventFilterProps) => {
  const { t } = useTranslation()
  const setFilter = (props: Partial<FilterProps>) => {
    onChange && onChange({...filter, ...props})
  }

  return (
    <Box m={1}>
      <Grid container justifyContent="space-around" spacing={1}>
        <Grid item xs={12} md={6} xl={2}>
          <DateRange
            start={filter.start}
            end={filter.end}
            range={{start: MIN_DATE}}
            startLabel={t("daterangeStart")}
            endLabel={t("daterangeEnd")}
            onChange={(start, end) => setFilter({ start, end })}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={4} xl>
          <AutocompleteMulti
            label={t('eventType')}
            onChange={(e, value) => setFilter({ eventType: value })}
            options={eventTypes}
            value={filter.eventType}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2} xl>
          <AutocompleteMulti
            label={t('eventClass')}
            onChange={(e, value) => setFilter({ eventClass: value })}
            options={['ALO', 'AVO', 'VOI']}
            value={filter.eventClass}
          />
        </Grid>
        <Grid item xs={12} sm={6} xl={2}>
          <AutocompleteMulti
            getOptionLabel={o => o.name}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            label={t('organizer')}
            onChange={(e, value) => setFilter({ organizer: value.map(v => +v.id) })}
            options={organizers}
            value={organizers.filter(o => filter.organizer.includes(o.id))}
          />
        </Grid>
        <Grid item xs={12} sm={6} xl={2}>
          <AutocompleteMulti
            getOptionLabel={o => o.name}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            label={t('judge')}
            onChange={(e, value) => setFilter({ judge: value.map(v => +v.id) })}
            options={judges}
            value={judges.filter(j => filter.judge.includes(j.id))}
          />
        </Grid>
        <Grid item md={12} xl={4}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0} alignItems="start" justifyContent="space-evenly">
            <Box sx={{ display: 'flex' }}>
              <FormControlLabel
                value="withOpenEntry"
                checked={filter.withOpenEntry}
                control={<Switch />}
                label={t('entryOpen')}
                onChange={(_event, checked) => setFilter({
                  withOpenEntry: checked,
                  withClosingEntry: checked && filter.withClosingEntry,
                  withFreePlaces: checked && filter.withFreePlaces,
                })}
              />
              <Box sx={{ display: 'inline-grid' }}>
                <FormControlLabel
                  value="withClosingEntry"
                  checked={filter.withClosingEntry}
                  control={<Switch color="secondary" size="small" />}
                  label="Vielä ehdit!"
                  onChange={(_event, checked) => setFilter({
                    withOpenEntry: filter.withOpenEntry || checked,
                    withClosingEntry: checked,
                  })}
                />
                <FormControlLabel
                  value="withFreePlaces"
                  checked={filter.withFreePlaces}
                  control={<Switch color="secondary" size="small" />}
                  label="Vielä mahtuu"
                  onChange={(_event, checked) => setFilter({
                    withOpenEntry: filter.withOpenEntry || checked,
                    withFreePlaces: checked,
                  })}
                />
              </Box>
            </Box>
            <FormControlLabel
              value="withUpcomingEntry"
              checked={filter.withUpcomingEntry}
              control={<Switch />}
              label="Ilmoittautuminen tulossa"
              labelPlacement="end"
              onChange={(_event, checked) => setFilter({ withUpcomingEntry: checked })}
            />
          </Stack>
        </Grid>
      </Grid>
    </Box>
  )
}
