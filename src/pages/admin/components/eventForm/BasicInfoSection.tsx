import type { ChangeEvent, SyntheticEvent } from 'react'
import type { DayValue } from '@/pages/components/DateRange'
import type {
  DayKey,
  DeepPartial,
  DogEvent,
  EventClass,
  EventType,
  Language,
  Organizer,
  Person,
  RegistrationClass,
  RetrieveType,
  User,
} from '@/types'
import type { BasicInfoEvent, PartialEvent, SectionProps } from './types'
import Checkbox from '@mui/material/Checkbox'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormHelperText from '@mui/material/FormHelperText'
import FormLabel from '@mui/material/FormLabel'
import Grid from '@mui/material/Grid'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import TextField from '@mui/material/TextField'
import { memo, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocalState } from '@/hooks/useLocalState'
import { addDays, daysBetween, eachDay } from '@/lib/day'
import {
  applySingleDayNowtGroups,
  defaultEntryEndDate,
  defaultEntryStartDate,
  EVENT_TRANSLATION_LANGUAGES,
  hasMockTrialChoice,
  hasRetrieveTypeChoice,
  isDetaultEntryEndDate,
  isDetaultEntryStartDate,
  isMockTrialClass,
  OFFICIAL_EVENT_TYPES,
} from '@/lib/event'
import CollapsibleSection from '@/pages/components/CollapsibleSection'
import DateRange from '@/pages/components/DateRange'
import { getRuleDate } from '@/rules'
import EventClasses from './components/EventClasses'
import EventProperty from './components/EventProperty'

export interface Props extends Readonly<Omit<SectionProps, 'event'>> {
  readonly event: BasicInfoEvent
  readonly eventTypes?: string[]
  readonly eventTypeClasses?: Record<string, RegistrationClass[]>
  readonly locations?: string[]
  readonly officials?: User[]
  readonly organizers?: Organizer[]
  readonly secretaries?: User[]
  readonly selectedEventType?: EventType
}

/** A stable default for `useLocalState`, so its initial-value effect does not fire on every render. */
const EMPTY_TRANSLATIONS: Partial<Record<Language, string>> = {}

const RETRIEVE_TYPES: RetrieveType[] = ['game', 'dummies']

const RETRIEVE_TYPE_SET = new Set<string>(RETRIEVE_TYPES)

const isRetrieveType = (value: string): value is RetrieveType => RETRIEVE_TYPE_SET.has(value)

const getTypeClasses = (
  eventType?: string,
  eventTypeClasses?: Record<string, RegistrationClass[]>,
  mockTrial?: boolean
) => {
  const classes = OFFICIAL_EVENT_TYPES.includes(eventType ?? '')
    ? (eventTypeClasses?.[eventType ?? ''] ?? [])
    : (eventTypeClasses?.unofficialEvents ?? [])
  // A Mock trial runs AVO and VOI only (KOE-308).
  return mockTrial ? classes.filter(isMockTrialClass) : classes
}

function BasicInfoSection({
  disabled,
  event,
  errorStates,
  helperTexts,
  fields,
  eventTypes,
  eventTypeClasses,
  locations,
  officials,
  open,
  onOpenChange,
  organizers,
  onChange,
  secretaries,
  selectedEventType,
}: Props) {
  const { t } = useTranslation()
  const typeOptions = eventClassOptions(event, getTypeClasses(event.eventType, eventTypeClasses, event.mockTrial))
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
        errorStates.retrieveType ||
        errorStates.secretary)) ||
    false
  const helperText = error
    ? t('validation.event.errors')
    : t('validation.event.effectiveRules', { date: getRuleDate(event.startDate) })
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
  // Without an organizer the secretary list holds the officials only (EventForm): say what to do
  // instead of showing "required" or an empty list (KOE-1473).
  const secretaryGuidance = !event.organizer?.id && !disabled ? t('event.secretaryRequiresOrganizer') : undefined
  const hasEntries = (event.entries ?? 0) > 0
  // The event's days are day keys (KOE-1547), counted and moved as days whatever zone the browser is in.
  const eventStartDay = event.startDate
  const eventEndDay = event.endDate
  const handleDateChange = useCallback(
    (start: DayValue, end: DayValue) => {
      // A cleared field keeps the day the event has.
      const startDate = start ?? eventStartDay
      let endDate = end ?? eventEndDay

      let { entryEndDate, entryStartDate } = event

      if (startDate !== eventStartDay) {
        if (endDate === eventEndDay) {
          // startDate changed and endDate remained the same => keep the distance between the days
          endDate = addDays(startDate, daysBetween(eventStartDay, eventEndDay))
        }
        if (isDetaultEntryStartDate(entryStartDate, eventStartDay)) {
          entryStartDate = defaultEntryStartDate(startDate)
        }
        if (isDetaultEntryEndDate(entryEndDate, eventStartDay)) {
          entryEndDate = defaultEntryEndDate(startDate)
        }
      }
      onChange?.({
        classes: updateClassDates(event, startDate, endDate),
        endDate,
        entryEndDate,
        entryStartDate,
        startDate,
      })
    },
    [event, eventEndDay, eventStartDay, onChange]
  )
  const handleTypeChange = useCallback(
    ({ eventType }: Partial<DogEvent>) => {
      // Only a NOWT can be a Mock trial (KOE-308); a trial that changes format drops the mark.
      const mockTrial = hasMockTrialChoice(eventType) ? event.mockTrial : null
      const filterClasses = getTypeClasses(eventType, eventTypeClasses, !!mockTrial)
      const classes = event.classes.filter((c) => filterClasses.includes(c.class))
      const official = OFFICIAL_EVENT_TYPES.includes(eventType ?? '')
      const judges =
        official && (event.judges.length === 0 || !event.judges[0].official)
          ? [{ id: 0, name: '', official: true }, ...event.judges]
          : event.judges
      // The game-or-dummies choice (KOE-439) is a B-trial's; a trial that changes format drops it, and
      // one that becomes a B-trial starts with game (KOE-1570).
      const retrieveType = hasRetrieveTypeChoice(eventType) ? (event.retrieveType ?? 'game') : null
      onChange?.({ classes, eventType, judges, mockTrial, retrieveType })
    },
    [event.classes, event.judges, event.mockTrial, event.retrieveType, eventTypeClasses, onChange]
  )
  const handleMockTrialChange = useCallback(
    (_e: ChangeEvent<HTMLInputElement>, checked: boolean) => {
      // A Mock trial runs AVO and VOI only (KOE-308): marking the trial one drops its ALO classes.
      const classes = checked ? event.classes.filter((c) => isMockTrialClass(c.class)) : event.classes
      onChange?.({ classes, mockTrial: checked })
    },
    [event.classes, onChange]
  )
  const handleRetrieveTypeChange = useCallback(
    (_e: ChangeEvent<HTMLInputElement>, value: string) => {
      if (isRetrieveType(value)) onChange?.({ retrieveType: value })
    },
    [onChange]
  )
  const handleClassesChange = useCallback(
    (_e: SyntheticEvent<Element, Event>, values: readonly DeepPartial<EventClass>[]) =>
      onChange?.({
        classes: applySingleDayNowtGroups(event.eventType, event.startDate, event.endDate, values),
      }),
    [event.endDate, event.eventType, event.startDate, onChange]
  )
  const [name, setName] = useLocalState(event.name ?? '', (value) => onChange?.({ name: value }))
  const handleNameChange = useCallback((e: ChangeEvent<HTMLInputElement>) => setName(e.target.value), [setName])
  // KOE-1263: the name can also be given in the other app languages; `name` stays the Finnish one.
  const [names, setNames] = useLocalState(event.names ?? EMPTY_TRANSLATIONS, (value) => onChange?.({ names: value }))
  const handleTranslatedNameChange = useCallback(
    (language: Language, value: string) => setNames((prev) => ({ ...prev, [language]: value })),
    [setNames]
  )
  const isEqualId = useCallback(
    (option?: { id?: number | string }, value?: string | { id?: number | string }) =>
      typeof value !== 'string' && option?.id === value?.id,
    []
  )
  const getId = useCallback((o?: string | { id?: number | string }) => (typeof o === 'string' ? o : (o?.id ?? '')), [])
  const getName = useCallback((o?: string | { name?: string }) => (typeof o === 'string' ? o : (o?.name ?? '')), [])
  const getNameOrEmail = useCallback(
    (o?: string | Partial<Person>) => (typeof o === 'string' ? o : o?.name || o?.email || ''),
    []
  )

  return (
    <CollapsibleSection
      title={t('eventInfo')}
      open={open}
      onOpenChange={onOpenChange}
      error={error}
      helperText={helperText}
    >
      <Grid
        container
        spacing={1}
        sx={{
          maxWidth: 1280,
        }}
      >
        <Grid container spacing={1}>
          <Grid sx={{ width: 600 }}>
            <DateRange
              startLabel={t('event.startDate')}
              endLabel={t('event.endDate')}
              start={eventStartDay}
              startDisabled={hasEntries || disabled}
              startError={errorStates?.startDate}
              startHelperText={helperTexts?.startDate}
              end={eventEndDay}
              endDisabled={disabled}
              endError={errorStates?.endDate}
              endHelperText={helperTexts?.endDate}
              required
              onChange={handleDateChange}
            />
          </Grid>
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
        {hasMockTrialChoice(event.eventType) ? (
          <Grid container spacing={1}>
            <Grid sx={{ width: 600 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={!!event.mockTrial}
                    disabled={hasEntries || disabled}
                    name="mockTrial"
                    onChange={handleMockTrialChange}
                  />
                }
                label={t('event.mockTrial')}
              />
            </Grid>
          </Grid>
        ) : null}
        {hasRetrieveTypeChoice(event.eventType) ? (
          <Grid container spacing={1}>
            <Grid sx={{ width: 600 }}>
              <FormControl
                disabled={disabled}
                error={errorStates?.retrieveType}
                required={fields?.required.retrieveType}
              >
                <FormLabel id="retrieveType-label">{t('event.retrieveType')}</FormLabel>
                <RadioGroup
                  aria-describedby={helperTexts?.retrieveType ? 'retrieveType-helper' : undefined}
                  aria-labelledby="retrieveType-label"
                  name="retrieveType"
                  onChange={handleRetrieveTypeChange}
                  row
                  value={event.retrieveType ?? ''}
                >
                  {RETRIEVE_TYPES.map((type) => (
                    <FormControlLabel
                      control={<Radio />}
                      key={type}
                      label={t(`event.retrieveTypes.${type}`)}
                      value={type}
                    />
                  ))}
                </RadioGroup>
                {helperTexts?.retrieveType ? (
                  <FormHelperText id="retrieveType-helper">{helperTexts.retrieveType}</FormHelperText>
                ) : null}
              </FormControl>
            </Grid>
          </Grid>
        ) : null}
        <Grid container spacing={1}>
          <Grid sx={{ width: 600 }}>
            <TextField
              disabled={disabled}
              label={`${t('event.name')} (${t('locale.fi')})`}
              fullWidth
              value={name}
              onChange={handleNameChange}
            />
          </Grid>
          {EVENT_TRANSLATION_LANGUAGES.map((language) => {
            const languageName = t(`locale.${language}`)
            return (
              <Grid key={language} sx={{ width: 600 }}>
                <TextField
                  disabled={disabled}
                  label={`${t('event.name')} (${languageName})`}
                  fullWidth
                  value={names[language] ?? ''}
                  onChange={(e) => handleTranslatedNameChange(language, e.target.value)}
                />
              </Grid>
            )
          })}
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
          <Grid sx={{ width: 300 }}>
            <EventProperty
              disabled={disabled}
              event={event}
              fields={fields}
              freeSolo
              id="location"
              onChange={onChange}
              options={locations ?? []}
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
              // The members of the organizer are offered once it is chosen; until then the list holds
              // the officials only, and a name missing from it looks like a bug (KOE-1473).
              helperText={secretaryGuidance}
              id="secretary"
              isOptionEqualToValue={isEqualId}
              noOptionsText={secretaryGuidance}
              onChange={onChange}
              options={secretaries ?? []}
            />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}

export default memo(BasicInfoSection)

function eventClassOptions(event: PartialEvent | undefined, typeClasses: RegistrationClass[]) {
  if (!event?.startDate || !event?.endDate) {
    return []
  }
  const startDay = event.startDate
  const endDay = event.endDate
  if (startDay > endDay) {
    return []
  }
  const result: EventClass[] = []
  for (const date of eachDay(startDay, endDay)) {
    result.push(
      ...typeClasses.map((c) => ({
        class: c,
        date,
      }))
    )
  }
  return result
}

/** The classes moved along with the start, each the same number of days from it; a class past the end is dropped. */
function updateClassDates(event: PartialEvent, startDay: DayKey, endDay: DayKey) {
  const result: EventClass[] = []
  for (const c of event.classes) {
    const day = addDays(startDay, daysBetween(event.startDate, c.date ?? event.startDate))
    if (day <= endDay) {
      result.push({ ...c, date: day })
    }
  }
  return result
}
