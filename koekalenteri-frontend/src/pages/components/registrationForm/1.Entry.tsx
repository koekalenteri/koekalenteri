import { SyntheticEvent, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Grid from '@mui/material/Grid'
import { format, isSameDay } from 'date-fns'
import { ConfirmedEvent, Registration, RegistrationDate, ReserveChoise } from 'koekalenteri-shared/model'

import { registrationDates, uniqueClasses } from '../../../utils'
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

  const getRegDateLabel = useCallback(
    (o: RegistrationDate) =>
      t('dateFormat.weekday', { date: o.date }) + (o.time ? ' ' + t(`registration.time.${o.time}`) : ''),
    [t]
  )
  const getReserveChoiceLabel = useCallback(
    (o: ReserveChoise | '') => (o !== '' ? t(`registration.reserveChoises.${o}`) : ''),
    [t]
  )

  const classes = uniqueClasses(event)
  const dates = registrationDates(event, reg.class)
  const error = errorStates.class ?? errorStates.dates ?? errorStates.reserve
  const datesText = reg.dates.map(getRegDateLabel).join(' / ')
  const reserveText = reg.reserve ? t(`registration.reserveChoises.${reg.reserve}`) : ''
  const infoText = `${reg.class ?? reg.eventType}, ${datesText}, ${reserveText}`
  const helperText = error ? t('validation.registration.required', { field: 'classesDetails' }) : infoText

  useEffect(() => {
    const changes: Partial<Registration> = {}
    if (className && reg.class !== className) {
      changes.class = className
    } else if (reg.class && !classes.includes(reg.class)) {
      changes.class = classes.length === 1 ? classes[0] : undefined
    } else if (!reg.class && classes.length) {
      changes.class = classes[0]
    }

    const cdates = changes.class ? registrationDates(event, changes.class) : dates
    const ddates = classDate ? cdates.filter((d) => format(d.date, 'dd.MM.') === classDate) : cdates
    const rdates = reg.dates.filter((rd) => ddates.find((d) => isSameDay(d.date, rd.date) && d.time === rd.time))
    if (!rdates.length || rdates.length !== reg.dates.length) {
      changes.dates = ddates
    }

    if (Object.keys(changes).length) {
      onChange?.(changes)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classes, className, event])

  const handleClassChange = useCallback((value: string) => onChange?.({ class: value }), [onChange])
  const handleDatesChange = useCallback(
    (_e: SyntheticEvent<Element, Event>, value: RegistrationDate[]) => onChange?.({ dates: value }),
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
        <Grid item sx={{ display: event.classes.length === 0 ? 'none' : 'block' }} xs={12} md={2}>
          <AutocompleteSingle
            disableClearable
            disabled={classDisabled || disabled}
            error={errorStates.class}
            helperText={helperTexts.class}
            label={t('registration.class')}
            onChange={handleClassChange}
            options={classes}
            value={reg.class ?? className}
          />
        </Grid>
        <Grid item xs={12} md={6}>
          <AutocompleteMulti
            disabled={disabled}
            error={errorStates.dates}
            helperText={t('registration.datesInfo')}
            label={t('registration.dates')}
            onChange={handleDatesChange}
            isOptionEqualToValue={(o, v) => o.date.valueOf() === v.date.valueOf() && o.time === v.time}
            getOptionLabel={getRegDateLabel}
            options={dates}
            value={reg.dates}
          />
        </Grid>
        <Grid item xs={12} md={4}>
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
      </Grid>
    </CollapsibleSection>
  )
}
