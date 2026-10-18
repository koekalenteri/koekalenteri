import type { SyntheticEvent } from 'react'
import type { Priority } from '@/lib/priority'
import type { DayValue } from '@/pages/components/DateRange'
import type { EventClass, RegistrationClass } from '@/types'
import type { EntryEvent, SectionProps } from './types'
import FormHelperText from '@mui/material/FormHelperText'
import Grid from '@mui/material/Grid'
import { clamp } from 'date-fns/clamp'
import { enqueueSnackbar } from 'notistack'
import { memo, useCallback, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { dayEnd, dayOf, dayStart, TIME_ZONE } from '@/lib/day'
import { isDevEnv } from '@/lib/env'
import { defaultEntryEndDate, defaultEntryStartDate, storedDayKey } from '@/lib/event'
import { getPrioritySort, PRIORITY, priorityValuesToPriority, RESTRICTION } from '@/lib/priority'
import AutocompleteMulti from '@/pages/components/AutocompleteMulti'
import CollapsibleSection from '@/pages/components/CollapsibleSection'
import DateRange from '@/pages/components/DateRange'
import { EventDates } from './entrySection/EventDates'
import EventFormPlaces from './entrySection/EventFormPlaces'

interface Props extends Readonly<Omit<SectionProps, 'changes' | 'event'>> {
  readonly event: EntryEvent
  readonly eventTypeClasses?: RegistrationClass[]
  readonly entryDatesChanged?: boolean
  /** The early-bird rate counts from the entry start, and the event has registrations (KOE-1568). */
  readonly entryStartLocked?: boolean
}

function EntrySection(props: Props) {
  const { t } = useTranslation(['translation', 'breed'])
  const {
    disabled,
    entryDatesChanged,
    entryStartLocked,
    errors,
    event,
    eventTypeClasses,
    fields,
    helperTexts,
    onChange,
    onOpenChange,
    open,
  } = props
  const prioritySort = getPrioritySort(t)
  const classesGroupsError = errors?.find(
    (validationError) => validationError && validationError.key === 'classesGroups'
  )
  // the message is not in helperTexts: it is only shown here, next to the class it belongs to
  const classesGroupsHelperText = classesGroupsError
    ? t(`validation.event.${classesGroupsError.key}`, classesGroupsError.opts)
    : undefined
  const error =
    helperTexts?.entryStartDate ??
    helperTexts?.entryEndDate ??
    helperTexts?.classes ??
    helperTexts?.places ??
    classesGroupsHelperText
  const invalidClasses = classesGroupsError ? classesGroupsError.opts.list : undefined
  const helperText = error ? t('validation.event.errors') : ''
  const eventPriority = useMemo(
    () => priorityValuesToPriority(event.priority).sort(prioritySort),
    [event.priority, prioritySort]
  )
  const sortedPriorities = useMemo(() => PRIORITY.slice().sort(prioritySort), [prioritySort])
  const eventRestrictions = useMemo(
    () => priorityValuesToPriority(event.restrictions, RESTRICTION).sort(prioritySort),
    [event.restrictions, prioritySort]
  )
  const sortedRestrictions = useMemo(() => RESTRICTION.slice().sort(prioritySort), [prioritySort])
  const allowPastRegistrationDates = isDevEnv()
  // The range speaks Finnish days; the stored dates stay instants until they are stored as days (KOE-1547).
  const registrationStartDay = allowPastRegistrationDates ? undefined : dayOf(event.createdAt ?? new Date(), TIME_ZONE)
  const eventStartDay = dayOf(event.startDate, TIME_ZONE)
  const registrationDateRange = useMemo(
    () => ({ end: eventStartDay, start: registrationStartDay }),
    [eventStartDay, registrationStartDay]
  )
  const hasPastRegistrationDate = useMemo(() => {
    const today = dayOf(new Date(), TIME_ZONE)
    return (
      (!!event.entryStartDate && dayOf(event.entryStartDate, TIME_ZONE) < today) ||
      (!!event.entryEndDate && dayOf(event.entryEndDate, TIME_ZONE) < today)
    )
  }, [event.entryEndDate, event.entryStartDate])

  const handleDateChange = useCallback(
    (start: DayValue, end: DayValue) =>
      onChange?.({
        entryEndDate: end ? dayEnd(end, TIME_ZONE) : undefined,
        entryStartDate: start ? dayStart(start, TIME_ZONE) : undefined,
      }),
    [onChange]
  )
  const handlePriorityChange = useCallback(
    (_e: SyntheticEvent<Element, Event>, value: readonly Priority[]) =>
      onChange?.({ priority: value.map((p) => p.value) }),
    [onChange]
  )
  const handleRestrictionsChange = useCallback(
    (_e: SyntheticEvent<Element, Event>, value: readonly Priority[]) =>
      onChange?.({ restrictions: value.map((p) => p.value) }),
    [onChange]
  )

  useEffect(() => {
    // KOE-808 make sure classes are inside event dates
    if (!event.classes.some((c) => c.date < event.startDate || c.date > event.endDate)) return

    const newClasses: EventClass[] = []
    const interval = { end: event.endDate, start: event.startDate }
    for (const cls of event.classes) {
      if (cls.date < interval.start || cls.date > interval.end) {
        const date = clamp(cls.date, interval)
        newClasses.push({ ...cls, date })
        enqueueSnackbar(
          t('event.classMoved', {
            from: `${cls.class}/${t('dateFormat.wdshort', { date: cls.date })}`,
            to: `${cls.class}/${t('dateFormat.wdshort', { date })}`,
          }),
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
      title={t('event.entrySectionTitle')}
      open={open}
      onOpenChange={onOpenChange}
      error={!!error}
      helperText={helperText}
    >
      <Grid
        container
        spacing={1}
        sx={{
          maxWidth: 900,
        }}
      >
        <Grid
          sx={{
            width: '100%',
          }}
        >
          <DateRange
            startDisabled={disabled || entryStartLocked}
            startHelperText={entryStartLocked ? t('event.entryStartLockedReason') : undefined}
            startLabel={t('event.entryStart')}
            endLabel={t('event.entryEnd')}
            start={storedDayKey(event.entryStartDate) ?? null}
            defaultStart={dayOf(defaultEntryStartDate(event.startDate), TIME_ZONE)}
            end={storedDayKey(event.entryEndDate) ?? null}
            endDisabled={disabled}
            defaultEnd={dayOf(defaultEntryEndDate(event.startDate), TIME_ZONE)}
            range={registrationDateRange}
            required={fields?.required.entryStartDate ?? fields?.required.entryEndDate}
            onChange={handleDateChange}
          />
          <FormHelperText error>{helperTexts?.entryStartDate ?? helperTexts?.entryEndDate}</FormHelperText>
          {allowPastRegistrationDates && entryDatesChanged && hasPastRegistrationDate && (
            <FormHelperText>{t('event.entryInPastDevOnly')}</FormHelperText>
          )}
        </Grid>
        <Grid
          sx={{
            width: '100%',
          }}
        >
          <EventDates
            disabled={disabled}
            event={event}
            eventTypeClasses={eventTypeClasses}
            invalidClasses={invalidClasses}
            invalidClassesHelperText={classesGroupsHelperText}
            onChange={onChange}
          />
        </Grid>
        <Grid
          sx={{
            width: '100%',
          }}
        >
          <EventFormPlaces disabled={disabled} {...props} />
        </Grid>
        <Grid
          sx={{
            width: '100%',
          }}
        >
          <AutocompleteMulti
            disabled={disabled}
            disablePortal
            groupBy={(o) => t(o.group)}
            isOptionEqualToValue={(o, v) => o?.value === v?.value}
            getOptionLabel={(o) => t(o.name)}
            options={sortedPriorities}
            onChange={handlePriorityChange}
            value={eventPriority}
            label={t('event.priority')}
          />
        </Grid>
        <Grid
          sx={{
            width: '100%',
          }}
        >
          <AutocompleteMulti
            disabled={disabled}
            disablePortal
            groupBy={(o) => t(o.group)}
            isOptionEqualToValue={(o, v) => o?.value === v?.value}
            getOptionLabel={(o) => t(o.name)}
            options={sortedRestrictions}
            onChange={handleRestrictionsChange}
            value={eventRestrictions}
            label={t('event.restrictions')}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}

export default memo(EntrySection)
