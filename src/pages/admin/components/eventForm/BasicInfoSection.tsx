import type { ChangeEvent, SyntheticEvent } from 'react'
import type { EventKcIdChoice } from '../../../../api/event'
import type {
  DeepPartial,
  DogEvent,
  EventClass,
  EventType,
  Organizer,
  Patch,
  Person,
  RegistrationClass,
  User,
} from '../../../../types'
import type { DateValue } from '../../../components/DateRange'
import type { PartialEvent, SectionProps } from './types'
import Sync from '@mui/icons-material/Sync'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { add, differenceInDays, eachDayOfInterval, isAfter, isSameDay } from 'date-fns'
import { enqueueSnackbar } from 'notistack'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilValue } from 'recoil'
import { searchEventKcIdChoices } from '../../../../api/event'
import { zonedDateString, zonedEndOfDay, zonedParseDate, zonedStartOfDay } from '../../../../i18n/dates'
import {
  defaultEntryEndDate,
  defaultEntryStartDate,
  isDetaultEntryEndDate,
  isDetaultEntryStartDate,
  OFFICIAL_EVENT_TYPES,
} from '../../../../lib/event'
import { getRuleDate } from '../../../../rules'
import CollapsibleSection from '../../../components/CollapsibleSection'
import DateRange from '../../../components/DateRange'
import { idTokenAtom } from '../../../recoil'
import EventClasses from './components/EventClasses'
import EventProperty from './components/EventProperty'
import KcIdChoiceDialog from './KcIdChoiceDialog'

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
    ? (eventTypeClasses?.[eventType ?? ''] ?? [])
    : (eventTypeClasses?.unofficialEvents ?? [])

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
  const token = useRecoilValue(idTokenAtom)
  const [kcIdRefreshing, setKcIdRefreshing] = useState(false)
  const [kcIdChoices, setKcIdChoices] = useState<EventKcIdChoice[]>([])
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
  const hasKcId = Boolean(event.kcId)
  const isOfficialEventType = OFFICIAL_EVENT_TYPES.includes(event.eventType ?? '')
  const selectedOrganizerId = event.organizer?.id
  const canEditKcId = Boolean(selectedOrganizerId) && !disabled && isOfficialEventType
  const handleLookupCriteriaChange = useCallback(
    (props: Patch<DogEvent>) => onChange?.(hasKcId ? { ...props, kcId: null } : props),
    [hasKcId, onChange]
  )
  const handleDateChange = useCallback(
    (start: DateValue, end: DateValue) => {
      start = zonedStartOfDay(start ?? event.startDate)
      end = zonedEndOfDay(end ?? event.endDate)

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
        classes: updateClassDates(event, start, end),
        endDate: end,
        entryEndDate,
        entryStartDate,
        startDate: start,
      })
    },
    [event, onChange]
  )
  const handleTypeChange = useCallback(
    ({ eventType }: Partial<DogEvent>) => {
      const filterClasses = getTypeClasses(eventType, eventTypeClasses)
      const classes = event.classes.filter((c) => filterClasses.includes(c.class))
      const official = OFFICIAL_EVENT_TYPES.includes(eventType ?? '')
      const judges =
        official && (event.judges.length === 0 || !event.judges[0].official)
          ? [{ id: 0, name: '', official: true }, ...event.judges]
          : event.judges
      handleLookupCriteriaChange({ classes, eventType, judges })
    },
    [event.classes, event.judges, eventTypeClasses, handleLookupCriteriaChange]
  )
  const handleClassesChange = useCallback(
    (_e: SyntheticEvent<Element, Event>, values: readonly DeepPartial<EventClass>[]) =>
      handleLookupCriteriaChange({ classes: [...values] }),
    [handleLookupCriteriaChange]
  )
  const handleNameChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => handleLookupCriteriaChange({ name: e.target.value }),
    [handleLookupCriteriaChange]
  )
  const isEqualId = useCallback((o?: { id?: number | string }, v?: { id?: number | string }) => o?.id === v?.id, [])
  const getId = useCallback((o?: string | { id?: number | string }) => (typeof o === 'string' ? o : (o?.id ?? '')), [])
  const getName = useCallback((o?: string | { name?: string }) => (typeof o === 'string' ? o : (o?.name ?? '')), [])
  const getNameOrEmail = useCallback(
    (o?: string | Partial<Person>) => (typeof o === 'string' ? o : o?.name || o?.email || ''),
    []
  )
  const handleKcIdRefresh = useCallback(async () => {
    if (!selectedOrganizerId) return

    setKcIdRefreshing(true)
    setKcIdChoices([])
    try {
      const result = await searchEventKcIdChoices(
        {
          classes: event.classes.map(({ class: eventClass, date }) => ({ class: eventClass, date })),
          endDate: event.endDate,
          eventType: event.eventType ?? '',
          location: event.location ?? '',
          name: event.name ?? '',
          organizer: { id: selectedOrganizerId },
          startDate: event.startDate,
        },
        token
      )
      if (result.choices.length) {
        setKcIdChoices(result.choices)
      } else {
        enqueueSnackbar(t('event.kcIdNotFound'), { variant: 'warning' })
      }
    } catch (error) {
      console.error(error)
      enqueueSnackbar(t('event.kcIdSearchFailed'), { variant: 'error' })
    } finally {
      setKcIdRefreshing(false)
    }
  }, [event, selectedOrganizerId, token, t])
  const handleKcIdChoiceClose = useCallback(() => setKcIdChoices([]), [])
  const handleKcIdChoice = useCallback(
    (choice: EventKcIdChoice) => {
      onChange?.(applyKcChoice(event, choice))
      setKcIdChoices([])
      enqueueSnackbar(t('event.kcIdSelected', { id: choice.id }), { variant: 'success' })
    },
    [event, onChange, t]
  )
  const handleKcIdRemove = useCallback(() => {
    onChange?.({ kcId: null })
    enqueueSnackbar(t('event.kcIdRemoved'), { variant: 'success' })
  }, [onChange, t])

  return (
    <>
      <CollapsibleSection
        title={t('eventInfo')}
        open={open}
        onOpenChange={onOpenChange}
        error={error}
        helperText={helperText}
      >
        <Grid container spacing={1} maxWidth={1280}>
          <Grid container spacing={1}>
            <Grid sx={{ width: 600 }}>
              <DateRange
                startLabel={t('event.startDate')}
                endLabel={t('event.endDate')}
                start={event.startDate}
                startDisabled={hasEntries || disabled || hasKcId}
                startError={errorStates?.startDate}
                startHelperText={helperTexts?.startDate}
                end={event.endDate}
                endDisabled={disabled || hasKcId}
                endError={errorStates?.endDate}
                endHelperText={helperTexts?.endDate}
                required
                onChange={handleDateChange}
              />
            </Grid>
            {isOfficialEventType && (
              <Grid sx={{ width: 520 }}>
                <Stack direction="row" spacing={1} alignItems="flex-start">
                  <EventProperty
                    id="kcId"
                    disabled
                    freeSolo
                    event={event}
                    fields={fields}
                    options={[]}
                    getOptionLabel={(o) => (o === undefined ? '' : `${o}`)}
                    onChange={onChange}
                    sx={{ width: 300 }}
                  />
                  {canEditKcId &&
                    (hasKcId ? (
                      <Stack direction="row" spacing={1} sx={{ pt: 1 }}>
                        <Button
                          variant="contained"
                          disabled={kcIdRefreshing}
                          size="small"
                          startIcon={<Sync fontSize="small" />}
                          onClick={handleKcIdRefresh}
                        >
                          {t('event.kcIdSwitch')}
                        </Button>
                        <Button variant="outlined" size="small" onClick={handleKcIdRemove}>
                          {t('event.kcIdRemove')}
                        </Button>
                      </Stack>
                    ) : (
                      <Button
                        variant="contained"
                        disabled={kcIdRefreshing}
                        size="small"
                        startIcon={<Sync fontSize="small" />}
                        sx={{ mt: 1 }}
                        onClick={handleKcIdRefresh}
                      >
                        {t('event.kcIdLookup')}
                      </Button>
                    ))}
                </Stack>
              </Grid>
            )}
          </Grid>
          <Grid container spacing={1}>
            <Grid sx={{ width: 300 }}>
              <EventProperty
                id="eventType"
                disabled={hasEntries || disabled}
                event={event}
                fields={fields}
                options={eventTypes ?? []}
                onChange={handleTypeChange}
              />
            </Grid>
            <Grid sx={{ width: 600 }}>
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
          <Grid container spacing={1}>
            <Grid sx={{ width: 600 }}>
              <TextField
                disabled={disabled}
                label={t('event.name')}
                fullWidth
                value={event.name ?? ''}
                onChange={handleNameChange}
              />
            </Grid>
          </Grid>
          <Grid container spacing={1}>
            <Grid sx={{ width: 600 }}>
              <EventProperty
                disabled={disabled}
                event={event}
                fields={fields}
                getOptionKey={getId}
                getOptionLabel={getName}
                id="organizer"
                isOptionEqualToValue={isEqualId}
                mapValue={(v: Organizer) => (v ? { id: v.id, name: v.name } : v)}
                onChange={handleLookupCriteriaChange}
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
            <Grid sx={{ width: 300 }}>
              <EventProperty
                disabled={disabled}
                event={event}
                fields={fields}
                freeSolo
                id="location"
                onChange={handleLookupCriteriaChange}
                options={[]}
              />
            </Grid>
          </Grid>
          <Grid container spacing={1}>
            <Grid sx={{ width: 450 }}>
              <EventProperty
                disabled={disabled}
                event={event}
                fields={fields}
                getOptionKey={getId}
                getOptionLabel={getNameOrEmail}
                id="official"
                isOptionEqualToValue={isEqualId}
                onChange={onChange}
                options={availableOfficials}
              />
            </Grid>
            <Grid sx={{ width: 450 }}>
              <EventProperty
                disabled={disabled}
                event={event}
                fields={fields}
                getOptionKey={getId}
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
      <KcIdChoiceDialog choices={kcIdChoices} onClose={handleKcIdChoiceClose} onSelect={handleKcIdChoice} />
    </>
  )
}

function eventClassOptions(event: PartialEvent | undefined, typeClasses: RegistrationClass[]) {
  if (!event?.startDate || !event?.endDate) {
    return []
  }
  const days = eachDayOfInterval({
    end: event.endDate,
    start: event.startDate,
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
    const date = zonedStartOfDay(add(start, { days: differenceInDays(c.date ?? event.startDate, event.startDate) }))
    if (!isAfter(date, end)) {
      result.push({ ...c, date })
    }
  }
  return result
}

function shiftDate(date: Date, oldStartDate: Date, newStartDate: Date) {
  return zonedStartOfDay(add(newStartDate, { days: differenceInDays(date, oldStartDate) }))
}

function applyKcChoice(event: PartialEvent, choice: EventKcIdChoice): Patch<DogEvent> {
  const startDate = zonedStartOfDay(choice.startDate)
  const endDate = zonedEndOfDay(choice.endDate)
  let { entryEndDate, entryStartDate } = event
  if (!isSameDay(startDate, event.startDate)) {
    if (isDetaultEntryStartDate(entryStartDate, event.startDate)) {
      entryStartDate = defaultEntryStartDate(startDate)
    }
    if (isDetaultEntryEndDate(entryEndDate, event.startDate)) {
      entryEndDate = defaultEntryEndDate(startDate)
    }
  }
  const classes = updateClassDates(event, startDate, endDate)
  const dates = event.dates
    ?.map((date) => ({
      ...date,
      date: shiftDate(date.date, event.startDate, startDate),
    }))
    .filter((date) => !isAfter(date.date, endDate))
  const placesPerDayStartDate = zonedParseDate(zonedDateString(event.startDate))
  const placesPerDay = event.placesPerDay
    ? Object.fromEntries(
        Object.entries(event.placesPerDay)
          .map(
            ([date, places]) =>
              [zonedDateString(shiftDate(zonedParseDate(date), placesPerDayStartDate, startDate)), places] as const
          )
          .filter(([date]) => !isAfter(zonedStartOfDay(date), endDate))
      )
    : undefined

  return {
    classes,
    dates,
    endDate,
    entryEndDate,
    entryStartDate,
    kcId: choice.id,
    placesPerDay,
    season: String(startDate.getFullYear()),
    startDate,
  }
}
