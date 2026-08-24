import Box from '@mui/material/Box'
import { NumberInput } from '../../../../../components/NumberInput'

interface TotalPlacesFieldProps {
  disabled: boolean
  value?: number
  onChange: (value?: number) => void
}

export default function TotalPlacesField({ disabled, value, onChange }: Readonly<TotalPlacesFieldProps>) {
  return (
    <Box sx={{ py: 1 }}>
      <NumberInput id="event.places" disabled={disabled} value={value} onChange={onChange} />
    </Box>
  )
}
