import { TextField, TextFieldProps } from '@mui/material'

export default function PlacesInput(props: JSX.IntrinsicAttributes & TextFieldProps) {
  return (
    <TextField
      {...props}
      value={props.value === 0 ? '' : props.value}
      type="number"
      size="small"
      InputProps={{ inputProps: { min: 0, max: 999, style: { textAlign: 'right', padding: 4 } } }}
    ></TextField>
  )
}
