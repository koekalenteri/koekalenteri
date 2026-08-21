import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useTranslation } from 'react-i18next'

interface Props {
  readonly years: number[]
  readonly value: number
  readonly onChange: (year: number) => void
}

export default function YearSelector({ years, value, onChange }: Props) {
  const { t } = useTranslation()

  return (
    <Box sx={{ alignItems: 'center', display: 'flex', flexWrap: 'wrap', gap: 1 }}>
      <Typography component="label" variant="subtitle2">
        {t('stats.year')}
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        value={value}
        onChange={(_event, newValue: number | null) => {
          if (newValue !== null) onChange(newValue)
        }}
      >
        {years.map((year) => (
          <ToggleButton key={year} value={year}>
            {year}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </Box>
  )
}
