import type { SyntheticEvent } from 'react'
import type { ConfirmedEvent, Registration, RegistrationClass, RegistrationDate, ReserveChoise } from '../../../types'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Grid from '@mui/material/Grid'
import { format, isSameDay } from 'date-fns'
import { useRecoilValue } from 'recoil'

import { eventDates, registrationDates, uniqueClasses, uniqueDate } from '../../../utils'
import { isRegistrationClass } from '../../admin/EventViewPage'
import { eventTypeGroupsAtom } from '../../recoil'
import AutocompleteMulti from '../AutocompleteMulti'
import AutocompleteSingle from '../AutocompleteSingle'
import CollapsibleSection from '../CollapsibleSection'

interface Props {
  readonly classDate?: string
  readonly classDisabled?: boolean
  readonly className?: string
  readonly disabled?: boolean
  readonly errorStates: { [Property in keyof Registration]?: boolean }
  readonly event: ConfirmedEvent
  readonly helperTexts: { [Property in keyof Registration]?: string }
  readonly onChange?: (props: Partial<Registration>) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
  readonly reg: Registration
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
  const eventTypeGroups = useRecoilValue(eventTypeGroupsAtom)

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
  const groups = eventTypeGroups[reg.eventType] ?? []
  const regDates = registrationDates(event, groups, reg.class)
  const [filterDates, setFilterDates] = useState<Date[]>(
    uniqueDate(classDate ? regDates.filter((d) => format(d.date, 'dd.MM.') === classDate).map((rd) => rd.date) : dates)
  )
  const isValidRegistrationDate = (rd: RegistrationDate) => filterDates.find((fd) => isSameDay(fd, rd.date))
  const datesAndTimes = regDates.filter(isValidRegistrationDate)
  const showDatesFilter = dates.length > 1
  const showDatesAndTimes = groups.length > 1

  console.log(datesAndTimes, regDates, groups, reg.class)

  useEffect(() => {
    const changes: Partial<Registration> = {}
    let newClass: string | undefined | null = null
    if (className && reg.class !== className) {
      newClass = className
    } else if (reg.class && !classes.includes(reg.class)) {
      newClass = classes.length > 0 ? classes[0] : undefined
    } else if (!reg.class && classes.length) {
      newClass = classes[0]
    }
    if (isRegistrationClass(newClass) || newClass === undefined) {
      changes.class = newClass
    }

    const cdates = changes.class || !showDatesAndTimes ? registrationDates(event, groups, changes.class) : datesAndTimes
    const ddates = cdates.filter(isValidRegistrationDate)
    const rdates = reg.dates.filter((rd) => ddates.find((d) => isSameDay(d.date, rd.date) && d.time === rd.time))
    if (!rdates.length || rdates.length !== reg.dates.length) {
      changes.dates = ddates
    }

    if (Object.keys(changes).length) {
      onChange?.(changes)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, className, event, filterDates, groups])

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
        <Grid item xs={12} md={6} sx={{ display: showDatesAndTimes ? undefined : 'none' }}>
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
