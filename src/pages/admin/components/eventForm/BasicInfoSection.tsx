import type { ChangeEvent, SyntheticEvent } from 'react'
import type {
  DeepPartial,
  DogEvent,
  EventClass,
  EventType,
  Organizer,
  Person,
  RegistrationClass,
  User,
} from '../../../../types'
import type { DateValue } from '../../../components/DateRange'
import type { PartialEvent, SectionProps } from '../EventForm'

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'
import { add, differenceInDays, eachDayOfInterval, isAfter, isSameDay, startOfDay } from 'date-fns'

import { getRuleDate } from '../../../../rules'
import CollapsibleSection from '../../../components/CollapsibleSection'
import DateRange from '../../../components/DateRange'
import {
  defaultEntryEndDate,
  defaultEntryStartDate,
  isDetaultEntryEndDate,
  isDetaultEntryStartDate,
} from '../../recoil'

import HelpPopover from './basicInfoSection/HelpPopover'
import EventClasses from './components/EventClasses'
import EventProperty from './components/EventProperty'
import { OFFICIAL_EVENT_TYPES } from './validation'

export interface Props extends Readonly<SectionProps> {
  readonly event: PartialEvent
  readonly eventTypes?: string[]
  readonly eventTypeClasses?: Record<string, RegistrationClass[]>
  readonly officials?: User[]
  readonly organizers?: Organizer[]
  readonly secretaries?: User[]
  readonly selectedEventType?: EventType
}

const getTypeClasses = (eventType?: string, eventTypeClasses?: Record<string, RegistrationClass[]>) =>
  OFFICIAL_EVENT_TYPES.includes(eventType ?? '')
    ? eventTypeClasses?.[eventType ?? ''] ?? []
    : eventTypeClasses?.unofficialEvents ?? []

export default function BasicInfoSection({
  disabled,
  event,
  errorStates,
  helperTexts,
  fields,
  eventTypes,
  eventTypeClasses,
  officials,
  open,
  onOpenChange,
  organizers,
  onChange,
  secretaries,
  selectedEventType,
}: Props) {
  const { t } = useTranslation()
  const [helpAnchorEl, setHelpAnchorEl] = useState<HTMLButtonElement | null>(null)
  const typeOptions = eventClassOptions(event, getTypeClasses(event.eventType, eventTypeClasses))
  const error =
    (errorStates &&
      (errorStates.startDate ||
        errorStates.endDate ||
        errorStates.kcId ||
        errorStates.eventType ||
        errorStates.classes ||
        errorStates.organizer ||
        errorStates.location ||
        errorStates.official ||
        errorStates.secretary)) ||
    false
  const helperText = error
    ? t('validation.event.errors')
    : t('validation.event.effectiveRules', { date: new Date(getRuleDate(event.startDate)) })
  const availableOfficials = useMemo(
    () =>
      officials?.filter(
        (o) =>
          !selectedEventType?.official ||
          !event.eventType ||
          (Array.isArray(o.officer) && o.officer.includes(event.eventType))
      ) ?? [],
    [event.eventType, officials, selectedEventType?.official]
  )
  const hasEntries = (event.entries ?? 0) > 0
  const handleDateChange = useCallback(
    (start: DateValue, end: DateValue) => {
      start = start ?? event.startDate
      end = end ?? event.endDate

      let { entryEndDate, entryStartDate } = event

      if (!isSameDay(start, event.startDate)) {
        if (isSameDay(end, event.endDate)) {
          // startDate changed and endDate remained the same => change endDate based on the previous distance between days
          end = add(start, { days: differenceInDays(event.endDate, event.startDate) })
        }
        if (isDetaultEntryStartDate(entryStartDate, event.startDate)) {
          entryStartDate = defaultEntryStartDate(start)
        }
        if (isDetaultEntryEndDate(entryEndDate, event.startDate)) {
          entryEndDate = defaultEntryEndDate(start)
        }
      }
      onChange?.({
        startDate: start,
        endDate: end,
        entryStartDate,
        entryEndDate,
        classes: updateClassDates(event, start, end),
      })
    },
    [event, onChange]
  )
  const openHelp = useCallback(
    (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => setHelpAnchorEl(e.currentTarget),
    []
  )
  const closeHelp = useCallback(() => setHelpAnchorEl(null), [])
  const handleTypeChange = useCallback(
    ({ eventType }: Partial<DogEvent>) => {
      const filterClasses = getTypeClasses(eventType, eventTypeClasses)
      const classes = event.classes.filter((c) => filterClasses.includes(c.class))
      onChange?.({ eventType, classes })
    },
    [event.classes, eventTypeClasses, onChange]
  )
  const handleClassesChange = useCallback(
    (e: SyntheticEvent<Element, Event>, values: readonly DeepPartial<EventClass>[]) =>
      onChange?.({ classes: [...values] }),
    [onChange]
  )
  const handleNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => onChange?.({ name: e.target.value }),
    [onChange]
  )
  const isEqualId = useCallback((o?: { id?: number | string }, v?: { id?: number | string }) => o?.id === v?.id, [])
  const getName = useCallback((o?: string | { name?: string }) => (typeof o === 'string' ? o : o?.name ?? ''), [])
  const getNameOrEmail = useCallback(
    (o?: string | Partial<Person>) => (typeof o === 'string' ? o : o?.name || o?.email || ''),
    []
  )

  return (
    <CollapsibleSection
      title="Tapahtuman perustiedot"
      open={open}
      onOpenChange={onOpenChange}
      error={error}
      helperText={helperText}
    >
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 600 }}>
            <DateRange
              startLabel={t('event.startDate')}
              endLabel={t('event.endDate')}
              start={event.startDate}
              startError={errorStates?.startDate}
              startHelperText={helperTexts?.startDate}
              end={event.endDate}
              endError={errorStates?.endDate}
              endHelperText={helperTexts?.endDate}
              required
              disabled={hasEntries || disabled}
              onChange={handleDateChange}
            />
          </Grid>
          <Grid item sx={{ width: 300, display: 'none' /* KOE-451 */ }}>
            <EventProperty
              id="kcId"
              disabled={disabled}
              freeSolo
              event={event}
              fields={fields}
              options={[]}
              getOptionLabel={(o) => (o === undefined ? '' : `${o}`)}
              onChange={onChange}
              helpClick={openHelp}
            />
            <HelpPopover anchorEl={helpAnchorEl} onClose={closeHelp}>
              {t('event.kcId_info')}
            </HelpPopover>
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <EventProperty
              id="eventType"
              disabled={hasEntries || disabled}
              event={event}
              fields={fields}
              options={eventTypes ?? []}
              onChange={handleTypeChange}
            />
          </Grid>
          <Grid item sx={{ width: 600 }}>
            <EventClasses
              id="class"
              disabled={disabled}
              eventStartDate={event.startDate}
              eventEndDate={event.endDate}
              required={fields?.required.classes}
              errorStates={errorStates}
              helperTexts={helperTexts}
              requiredState={fields?.state.classes}
              value={event.classes}
              classes={typeOptions}
              label={t('event.classes')}
              showCount
              onChange={handleClassesChange}
            />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 600 }}>
            <TextField
              disabled={disabled}
              label="Tapahtuman nimi"
              fullWidth
              value={event.name ?? ''}
              onChange={handleNameChange}
            />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 600 }}>
            <EventProperty
              disabled={disabled}
              event={event}
              fields={fields}
              getOptionLabel={getName}
              id="organizer"
              isOptionEqualToValue={isEqualId}
              mapValue={(v: Organizer) => (v ? { id: v.id, name: v.name } : v)}
              onChange={onChange}
              options={organizers ?? []}
              renderOption={(props, option) => {
                if (!option) return null
                return (
                  <li {...props} key={option.id}>
                    {option.name}
                  </li>
                )
              }}
            />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <EventProperty
              disabled={disabled}
              event={event}
              fields={fields}
              freeSolo
              id="location"
              onChange={onChange}
              options={[]}
            />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 450 }}>
            <EventProperty
              disabled={disabled}
              event={event}
              fields={fields}
              getOptionLabel={getNameOrEmail}
              id="official"
              isOptionEqualToValue={isEqualId}
              onChange={onChange}
              options={availableOfficials}
            />
          </Grid>
          <Grid item sx={{ width: 450 }}>
            <EventProperty
              disabled={disabled}
              event={event}
              fields={fields}
              getOptionLabel={getNameOrEmail}
              id="secretary"
              isOptionEqualToValue={isEqualId}
              onChange={onChange}
              options={secretaries ?? []}
            />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}

function eventClassOptions(event: PartialEvent | undefined, typeClasses: RegistrationClass[]) {
  if (!event?.startDate || !event?.endDate) {
    return []
  }
  const days = eachDayOfInterval({
    start: event.startDate,
    end: event.endDate,
  })
  const result: EventClass[] = []
  for (const day of days) {
    result.push(
      ...typeClasses.map((c) => ({
        class: c,
        date: day,
      }))
    )
  }
  return result
}

function updateClassDates(event: PartialEvent, start: Date, end: Date) {
  const result: EventClass[] = []
  for (const c of event.classes) {
    const date = startOfDay(add(start, { days: differenceInDays(c.date ?? event.startDate, event.startDate) }))
    if (!isAfter(date, end)) {
      result.push({ ...c, date })
    }
  }
  return result
}
