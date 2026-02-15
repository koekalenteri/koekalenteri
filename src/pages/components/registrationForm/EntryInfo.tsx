import type { SyntheticEvent } from 'react'
import type {
  PublicConfirmedEvent,
  Registration,
  RegistrationClass,
  RegistrationDate,
  RegistrationTime,
  ReserveChoise,
} from '../../../types'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Grid from '@mui/material/Grid'
import { format, isSameDay } from 'date-fns'

import { useAdminEventRegistrationDates } from '../../../hooks/useAdminEventRegistrationDates'
import { isRegistrationClass } from '../../../lib/registration'
import { registrationDates, unique, uniqueClasses, uniqueDate } from '../../../lib/utils'
import AutocompleteMulti from '../AutocompleteMulti'
import AutocompleteSingle from '../AutocompleteSingle'
import CollapsibleSection from '../CollapsibleSection'

import { useLocalState } from './hooks/useLocalState'

// Helper to sort registration dates
const sortRegistrationDates = (dates: RegistrationDate[]): RegistrationDate[] => {
  return [...dates].sort((a, b) => {
    if (a.date !== b.date) return a.date.valueOf() - b.date.valueOf()
    if (a.time && b.time) return a.time.localeCompare(b.time)
    return 0
  })
}

interface Props {
  readonly classDate?: string
  readonly classDisabled?: boolean
  readonly className?: string
  readonly disabled?: boolean
  readonly errorStates: { [Property in keyof Registration]?: boolean }
  readonly event: PublicConfirmedEvent
  readonly helperTexts: { [Property in keyof Registration]?: string }
  readonly onChange?: (props: Partial<Registration>) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
  readonly reg: Partial<Registration>
}

export function EntryInfo({
  classDate,
  classDisabled,
  className,
  disabled,
  errorStates,
  event,
  helperTexts,
  onChange,
  onOpenChange,
  open,
  reg,
}: Props) {
  const { t } = useTranslation()

  // Extract label formatters
  const getRegDateLabel = useCallback((o: Date) => t('dateFormat.wdshort', { date: o }), [t])
  const getRegDateTimeLabel = useCallback(
    (o: RegistrationDate) =>
      t('dateFormat.weekday', { date: o.date }) + (o.time ? ' ' + t(`registration.timeLong.${o.time}`) : ''),
    [t]
  )
  const getReserveChoiceLabel = useCallback(
    (o: ReserveChoise | ''): string => (o !== '' ? t(`registration.reserveChoises.${o}`) : ''),
    [t]
  )

  // Extract date and class calculations
  const classes = uniqueClasses(event)
  const regDates = useAdminEventRegistrationDates(event, reg.class ?? className)
  const dates = uniqueDate(regDates.map((rd) => rd.date))

  // Helper function to determine initial filter dates
  const getInitialFilterDates = useCallback(() => {
    const selectedDates = reg?.dates?.filter((rd) => dates.some((d) => isSameDay(d, rd.date))) ?? []
    const tmpDates = selectedDates.length ? selectedDates.map((rd) => rd.date) : dates

    return uniqueDate(
      classDate ? regDates.filter((d) => format(d.date, 'dd.MM.') === classDate).map((rd) => rd.date) : tmpDates
    )
  }, [classDate, dates, reg?.dates, regDates])

  // Local state for form fields with debounced updates
  const [selectedClass, setSelectedClass] = useLocalState<RegistrationClass | null | undefined>(reg.class, (value) => {
    onChange?.({ class: value })
  })

  const [selectedDates, setSelectedDates] = useLocalState<RegistrationDate[] | undefined>(reg.dates, (value) => {
    onChange?.({ dates: value })
  })

  const [selectedReserve, setSelectedReserve] = useLocalState<'' | ReserveChoise | undefined>(reg.reserve, (value) => {
    onChange?.({ reserve: value })
  })

  // Update local state when props change
  useEffect(() => {
    setSelectedClass(reg.class)
    setSelectedDates(reg.dates)
    setSelectedReserve(reg.reserve)
  }, [reg.class, reg.dates, reg.reserve])

  const [filterDates, setFilterDates] = useState<Date[]>(() => getInitialFilterDates())

  // Helper functions for date filtering
  const isValidRegistrationDate = useCallback(
    (rd: RegistrationDate) => filterDates.some((fd) => isSameDay(fd, rd.date)),
    [filterDates]
  )

  const datesAndTimes = useMemo(() => regDates.filter(isValidRegistrationDate), [regDates, isValidRegistrationDate])
  const groups = useMemo(
    () => unique(datesAndTimes.map((dt) => dt.time).filter((time): time is RegistrationTime => !!time)),
    [datesAndTimes]
  )

  // UI display flags
  const showDatesFilter = dates.length > 1
  const showDatesAndTimes = groups.length > 1
  const sizeSwitch = showDatesFilter && showDatesAndTimes

  // Error and text display helpers
  const error = errorStates.class ?? errorStates.dates ?? errorStates.reserve
  const datesText = showDatesFilter ? reg.dates?.map(getRegDateTimeLabel).join(' / ') : ''
  const reserveText = reg.reserve ? t(`registration.reserveChoises.${reg.reserve}`) : ''
  const infoText = [reg.class ?? reg.eventType, datesText, reserveText].filter(Boolean).join(', ')
  const helperText = error ? t('validation.registration.required', { field: 'classesDetails' }) : infoText

  // Update filter dates when dates change
  useEffect(() => {
    if (!showDatesFilter) {
      const validFilters = filterDates.filter((fd) => dates.some((d) => d.valueOf() === fd.valueOf()))
      if (!validFilters.length && dates.length) {
        setFilterDates(dates)
      }
    }
  }, [dates, filterDates, showDatesFilter])

  // Handle class changes
  const updateClassIfNeeded = useCallback((): RegistrationClass | undefined | null => {
    // Case 1: Override with provided className
    if (className && reg.class !== className) {
      return isRegistrationClass(className) ? className : undefined
    }

    // Case 2: Current class is invalid, select first available or undefined
    if (reg.class && !classes.includes(reg.class)) {
      return classes.length > 0 ? classes[0] : undefined
    }

    // Case 3: No class selected but options available
    if (!reg.class && classes.length) {
      return classes[0]
    }

    // No change needed
    return null
  }, [className, reg.class, classes])

  // Helper to get valid dates based on class
  const getValidDates = useCallback(
    (classValue?: RegistrationClass | null) => {
      const availableDates =
        classValue || !showDatesAndTimes ? registrationDates(event, groups, classValue) : datesAndTimes
      return availableDates.filter(isValidRegistrationDate)
    },
    [event, groups, isValidRegistrationDate, showDatesAndTimes, datesAndTimes]
  )

  // Helper to handle date filtering
  const handleDateFiltering = useCallback(
    (currentDates: RegistrationDate[], availableDates: RegistrationDate[]): RegistrationDate[] | undefined => {
      // No dates selected in filter means empty selection
      if (filterDates.length === 0) {
        return []
      }

      // Find dates in filter that aren't in current selection
      const missingFilterDates = filterDates.filter(
        (filterDate) => !currentDates.some((ud) => isSameDay(ud.date, filterDate))
      )

      // No missing dates, no changes needed
      if (!missingFilterDates.length) {
        return undefined
      }

      // Add available dates that match missing filter dates
      const datesToAdd = availableDates.filter((availableDate) =>
        missingFilterDates.some((date) => isSameDay(date, availableDate.date))
      )

      return datesToAdd.length ? [...currentDates, ...datesToAdd] : undefined
    },
    [filterDates]
  )

  // Update registration based on changes
  useEffect(() => {
    const changes: Partial<Registration> = {}

    // Handle class changes
    const newClass = updateClassIfNeeded()
    if (newClass !== null) {
      changes.class = newClass
    }

    // Get valid dates based on class
    const validDates = getValidDates(changes.class)

    const validCurrentDates =
      reg.dates?.filter((rd) => validDates.some((d) => isSameDay(d.date, rd.date) && d.time === rd.time)) ?? []

    // Update dates if current selection is invalid
    if (!validCurrentDates.length || validCurrentDates.length !== reg.dates?.length) {
      if (validDates.length) changes.dates = validDates
    }

    // Handle date filtering
    if (showDatesFilter) {
      const currentDates = changes.dates ?? reg.dates ?? []
      const updatedDates = handleDateFiltering(currentDates, validDates)

      if (updatedDates !== undefined) {
        changes.dates = updatedDates
      }
    }

    // Sort dates if needed
    if (changes.dates) {
      changes.dates = sortRegistrationDates(changes.dates)
    }

    // Apply changes
    if (Object.keys(changes).length) {
      onChange?.(changes)
    }
  }, [getValidDates, handleDateFiltering, onChange, reg.dates, showDatesFilter, updateClassIfNeeded, event.id])

  // Event handlers
  const handleClassChange = useCallback((value: RegistrationClass) => setSelectedClass(value), [setSelectedClass])

  const handleDatesAndTimesChange = useCallback(
    (_e: SyntheticEvent<Element, Event>, value: readonly RegistrationDate[]) => setSelectedDates([...value]),
    [setSelectedDates]
  )

  const handleReserveChange = useCallback(
    (value: '' | ReserveChoise) => {
      // Convert empty string to undefined, otherwise use the value as ReserveChoise
      const reserveValue = value === '' ? undefined : value
      setSelectedReserve(reserveValue)
    },
    [setSelectedReserve]
  )

  return (
    <CollapsibleSection
      title={t('registration.class')}
      border={false}
      error={error}
      helperText={helperText}
      open={open}
      onOpenChange={onOpenChange}
    >
      <Grid container spacing={1}>
        <Grid sx={{ display: event.classes.length === 0 ? 'none' : 'block' }} size={{ xs: 12, md: sizeSwitch ? 6 : 2 }}>
          <AutocompleteSingle
            disableClearable
            disabled={classDisabled || disabled}
            error={errorStates.class}
            helperText={helperTexts.class}
            label={t('registration.class')}
            onChange={handleClassChange}
            options={classes}
            value={selectedClass ?? undefined}
          />
        </Grid>
        <Grid size={{ xs: 12, md: sizeSwitch ? 6 : 4 }}>
          <AutocompleteSingle
            disableClearable
            disabled={disabled}
            error={errorStates.reserve}
            helperText={helperTexts.reserve}
            label={t('registration.reserve')}
            onChange={handleReserveChange}
            getOptionLabel={getReserveChoiceLabel}
            options={['ANY', 'DAY', 'WEEK' /*, 'NO'*/] as ReserveChoise[]}
            value={selectedReserve}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }} sx={{ display: showDatesFilter ? undefined : 'none' }}>
          <AutocompleteMulti
            disabled={disabled}
            error={errorStates.dates || (showDatesFilter && filterDates.length === 0)}
            helperText={t('registration.datesFilterInfo')}
            label={t('registration.datesFilter')}
            onChange={(_, value) => {
              setFilterDates([...value].sort((a, b) => a.valueOf() - b.valueOf()))
            }}
            isOptionEqualToValue={(o, v) => o.valueOf() === v.valueOf()}
            getOptionLabel={getRegDateLabel}
            options={dates}
            value={filterDates}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }} sx={{ display: showDatesAndTimes ? undefined : 'none' }}>
          <AutocompleteMulti
            disabled={disabled}
            error={errorStates.dates}
            helperText={t('registration.datesInfo')}
            label={t('registration.dates')}
            onChange={handleDatesAndTimesChange}
            isOptionEqualToValue={(o, v) => o.date?.valueOf() === v.date?.valueOf() && o.time === v.time}
            getOptionLabel={getRegDateTimeLabel}
            options={datesAndTimes}
            value={selectedDates}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
