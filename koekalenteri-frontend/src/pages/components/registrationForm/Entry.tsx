import type {
  ConfirmedEvent,
  Registration,
  RegistrationClass,
  RegistrationDate,
  ReserveChoise,
} from 'koekalenteri-shared/model'
import type { SyntheticEvent } from 'react'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Grid from '@mui/material/Grid'
import { format, isSameDay } from 'date-fns'

import { eventDates, registrationDates, uniqueClasses, uniqueDate } from '../../../utils'
import { isRegistrationClass } from '../../admin/EventViewPage'
import AutocompleteMulti from '../AutocompleteMulti'
import AutocompleteSingle from '../AutocompleteSingle'
import CollapsibleSection from '../CollapsibleSection'

type EntryInfoProps = {
  reg: Registration
  event: ConfirmedEvent
  classDate?: string
  classDisabled?: boolean
  className?: string
  error?: boolean
  disabled?: boolean
  helperText?: string
  errorStates: { [Property in keyof Registration]?: boolean }
  helperTexts: { [Property in keyof Registration]?: string }
  onChange?: (props: Partial<Registration>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

export function EntryInfo({
  reg,
  event,
  classDate,
  classDisabled,
  className,
  disabled,
  errorStates,
  helperTexts,
  onChange,
  onOpenChange,
  open,
}: EntryInfoProps) {
  const { t } = useTranslation()

  const getRegDateLabel = useCallback((o: Date) => t('dateFormat.weekday', { date: o }), [t])
  const getRegDateTimeLabel = useCallback(
    (o: RegistrationDate) =>
      t('dateFormat.weekday', { date: o.date }) + (o.time ? ' ' + t(`registration.time.${o.time}`) : ''),
    [t]
  )
  const getReserveChoiceLabel = useCallback(
    (o: ReserveChoise | '') => (o !== '' ? t(`registration.reserveChoises.${o}`) : ''),
    [t]
  )

  const classes = uniqueClasses(event)
  const dates = eventDates(event)
  const error = errorStates.class ?? errorStates.dates ?? errorStates.reserve
  const datesText = reg.dates.map(getRegDateTimeLabel).join(' / ')
  const reserveText = reg.reserve ? t(`registration.reserveChoises.${reg.reserve}`) : ''
  const infoText = `${reg.class ?? reg.eventType}, ${datesText}, ${reserveText}`
  const helperText = error ? t('validation.registration.required', { field: 'classesDetails' }) : infoText
  const [filterDates, setFilterDates] = useState<Date[]>(
    uniqueDate(
      classDate
        ? registrationDates(event, reg.class)
            .filter((d) => format(d.date, 'dd.MM.') === classDate)
            .map((rd) => rd.date)
        : dates
    )
  )
  const isValidRegistrationDate = (rd: RegistrationDate) => filterDates.find((fd) => fd.valueOf() === rd.date.valueOf())
  const datesAndTimes = registrationDates(event, reg.class).filter(isValidRegistrationDate)
  const showDatesFilter = dates.length > 1

  useEffect(() => {
    const changes: Partial<Registration> = {}
    let newClass: string | undefined
    if (className && reg.class !== className) {
      newClass = className
    } else if (reg.class && !classes.includes(reg.class)) {
      newClass = classes.length > 0 ? classes[0] : undefined
    } else if (!reg.class && classes.length) {
      newClass = classes[0]
    }
    if (isRegistrationClass(newClass)) {
      changes.class = newClass
    }

    const cdates = changes.class ? registrationDates(event, changes.class) : datesAndTimes
    const ddates = cdates.filter(isValidRegistrationDate)
    const rdates = reg.dates.filter((rd) => ddates.find((d) => isSameDay(d.date, rd.date) && d.time === rd.time))
    if (!rdates.length || rdates.length !== reg.dates.length) {
      changes.dates = ddates
    }

    if (Object.keys(changes).length) {
      onChange?.(changes)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, className, event, filterDates])

  const handleClassChange = useCallback((value: RegistrationClass) => onChange?.({ class: value }), [onChange])
  const handleDatesAndTimesChange = useCallback(
    (_e: SyntheticEvent<Element, Event>, value: readonly RegistrationDate[]) => onChange?.({ dates: [...value] }),
    [onChange]
  )
  const handleReserveChange = useCallback(
    (value: '' | ReserveChoise) => onChange?.({ reserve: value || undefined }),
    [onChange]
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
        <Grid item sx={{ display: event.classes.length === 0 ? 'none' : 'block' }} xs={12} md={showDatesFilter ? 6 : 2}>
          <AutocompleteSingle
            disableClearable
            disabled={classDisabled || disabled}
            error={errorStates.class}
            helperText={helperTexts.class}
            label={t('registration.class')}
            onChange={handleClassChange}
            options={classes}
            value={reg.class}
          />
        </Grid>
        <Grid item xs={12} md={showDatesFilter ? 6 : 4}>
          <AutocompleteSingle
            disableClearable
            disabled={disabled}
            error={errorStates.reserve}
            helperText={helperTexts.reserve}
            label={t('registration.reserve')}
            onChange={handleReserveChange}
            getOptionLabel={getReserveChoiceLabel}
            options={['ANY', 'DAY', 'WEEK' /*, 'NO'*/] as ReserveChoise[]}
            value={reg.reserve}
          />
        </Grid>
        <Grid item xs={12} md={6} sx={{ display: showDatesFilter ? undefined : 'none' }}>
          <AutocompleteMulti
            disabled={disabled}
            error={errorStates.dates}
            helperText={t('registration.datesFilterInfo')}
            label={t('registration.datesFilter')}
            onChange={(_, value) => setFilterDates(value)}
            isOptionEqualToValue={(o, v) => o.valueOf() === v.valueOf()}
            getOptionLabel={getRegDateLabel}
            options={dates}
            value={filterDates}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <AutocompleteMulti
            disabled={disabled}
            error={errorStates.dates}
            helperText={t('registration.datesInfo')}
            label={t('registration.dates')}
            onChange={handleDatesAndTimesChange}
            isOptionEqualToValue={(o, v) => o.date.valueOf() === v.date.valueOf() && o.time === v.time}
            getOptionLabel={getRegDateTimeLabel}
            options={datesAndTimes}
            value={reg.dates}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
