import type { Registration } from '../../../types'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'
import { zonedDateString } from '../../../i18n/dates'
import { getRegistrationPlacement } from '../../../lib/registration'

/** One day of a multi-day event, keyed the way the server scopes number uniqueness (yyyy-MM-dd). */
export interface StartDay {
  date: Date
  key: string
}

type PlacedRegistration = Pick<Registration, 'group' | 'startGroup'>

/** The day a dog is placed on, or undefined for one that has no placement yet (a reserve). */
export const startDayKey = (registration: PlacedRegistration): string | undefined => {
  const date = getRegistrationPlacement(registration)?.date
  return date ? zonedDateString(date) : undefined
}

/** The days these dogs run on, in order. The screens that work day by day share this reading. */
export const startDaysOf = (registrations: PlacedRegistration[]): StartDay[] =>
  registrations
    .map((registration) => getRegistrationPlacement(registration)?.date)
    .filter((date): date is Date => !!date)
    .map((date) => ({ date, key: zonedDateString(date) }))
    .filter((day, index, all) => all.findIndex((other) => other.key === day.key) === index)
    .sort((a, b) => a.key.localeCompare(b.key))

interface Props {
  readonly days: StartDay[]
  readonly value?: string
  readonly onChange: (key: string) => void
}

/**
 * A multi-day trial is worked one day at a time, so both the number entry and the results entry go
 * day by day (KOE-1303, KOE-1353). The day is picked before the class and holds while the classes are
 * worked through (KOE-1350). Rendered only where there is a day to choose.
 */
export function StartDaySelector({ days, value, onChange }: Props) {
  const { t } = useTranslation()

  if (days.length < 2) return null

  return (
    <Stack alignItems="center" direction="row" spacing={2} sx={{ pt: 1, px: 2 }} useFlexGap flexWrap="wrap">
      <Typography variant="body2" color="text.secondary">
        {t('startNumbers.day')}
      </Typography>
      <ToggleButtonGroup
        color="primary"
        exclusive
        onChange={(_event, next: string | null) => next && onChange(next)}
        size="small"
        value={value}
      >
        {days.map((day) => (
          <ToggleButton key={day.key} value={day.key}>
            {t('dateFormat.wdshort', { date: day.date })}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Stack>
  )
}
