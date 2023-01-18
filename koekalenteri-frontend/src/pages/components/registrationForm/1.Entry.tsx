import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Grid } from '@mui/material'
import { ConfirmedEvent, Registration, RegistrationDate, ReserveChoise } from 'koekalenteri-shared/model'

import { registrationDates, uniqueClasses } from '../../../utils'
import AutocompleteMulti from '../AutocompleteMulti'
import AutocompleteSingle from '../AutocompleteSingle'
import CollapsibleSection from '../CollapsibleSection'

type EntryInfoProps = {
  reg: Registration
  event: ConfirmedEvent
  classDate?: string
  className?: string
  error?: boolean
  helperText?: string
  errorStates: { [Property in keyof Registration]?: boolean }
  helperTexts: { [Property in keyof Registration]?: string }
  onChange: (props: Partial<Registration>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

export function EntryInfo({ reg, event, classDate, className, errorStates, helperTexts, onChange, onOpenChange, open }: EntryInfoProps) {
  const { t } = useTranslation()

  const getRegDateLabel = useCallback((o: RegistrationDate) => t('dateFormat.weekday', { date: o.date }) + (o.time ? (' ' + t(`registration.time.${o.time}`)) : ''), [t])
  const getReserveChoiceLabel = useCallback((o: ReserveChoise | '') => o !== '' ? t(`registration.reserveChoises.${o}`) : '', [t])

  const classes = uniqueClasses(event)
  const dates = registrationDates(event, reg.class)
  const error = errorStates.class || errorStates.dates || errorStates.reserve
  const datesText = reg.dates.map(getRegDateLabel).join(' / ')
  const reserveText = reg.reserve ? t(`registration.reserveChoises.${reg.reserve}`) : ''
  const infoText = `${reg.class || reg.eventType}, ${datesText}, ${reserveText}`
  const helperText = error ? t('validation.registration.required', { field: 'classesDetails' }) : infoText

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
        <Grid item sx={{ minWidth: 100, display: event.classes.length === 0 ? 'none' : 'block' }}>
          <AutocompleteSingle
            disableClearable
            error={errorStates.class}
            helperText={helperTexts.class}
            label={t("registration.class")}
            onChange={(value) => { onChange({ class: value }) }}
            options={classes}
            value={reg.class ?? className}
          />
        </Grid>
        <Grid item>
          <AutocompleteMulti
            error={errorStates.dates}
            helperText={t("registration.datesInfo")}
            label={t("registration.dates")}
            onChange={(_e, value) => onChange({ dates: value })}
            isOptionEqualToValue={(o, v) => o.date.valueOf() === v.date.valueOf() && o.time === v.time}
            getOptionLabel={getRegDateLabel}
            options={dates}
            value={reg.dates}
          />
        </Grid>
        <Grid item sx={{ width: 280 }}>
          <AutocompleteSingle
            disableClearable
            error={errorStates.reserve}
            helperText={helperTexts.reserve}
            label={t('registration.reserve')}
            onChange={(value) => onChange({ reserve: value || undefined })}
            getOptionLabel={getReserveChoiceLabel}
            options={['ANY', 'DAY', 'WEEK', 'NO'] as ReserveChoise[]}
            value={reg.reserve}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
