import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'

/** One day of a multi-day class, keyed the way the server scopes number uniqueness (yyyy-MM-dd). */
export interface StartDay {
  date: Date
  key: string
}

interface Props {
  readonly days: StartDay[]
  readonly value?: string
  readonly onChange: (key: string) => void
}

/**
 * A multi-day class draws its numbers one morning at a time, so the entry goes day by day too
 * (KOE-1303). Rendered only where there is a day to choose; a single-day class has nothing to pick.
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
