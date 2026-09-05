import Box from '@mui/material/Box'
import { useTranslation } from 'react-i18next'
import { NumberInput } from '../../../../../components/NumberInput'

interface TotalPlacesFieldProps {
  disabled: boolean
  value?: number
  onChange: (value?: number) => void
}

export default function TotalPlacesField({ disabled, value, onChange }: Readonly<TotalPlacesFieldProps>) {
  const { t } = useTranslation()

  return (
    <Box sx={{ py: 1 }}>
      <NumberInput
        id="event.places"
        slotProps={{ input: { inputProps: { 'aria-label': t('event.placesEditor.title') } } }}
        disabled={disabled}
        value={value}
        onChange={onChange}
      />
    </Box>
  )
}
