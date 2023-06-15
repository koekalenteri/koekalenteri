import { ChangeEventHandler, useCallback, useEffect, useState } from 'react'
import { StandardTextFieldProps, TextField } from '@mui/material'

import useDebouncedCallback from '../../../../../../hooks/useDebouncedCallback'

interface Props extends Omit<StandardTextFieldProps, 'onChange'> {
  value?: number
  onChange?: (value: number) => void
}

export default function PlacesInput(props: Props) {
  const [value, setValue] = useState(props.value ?? 0)

  const dispatchChange = useDebouncedCallback((value: number) => props.onChange?.(value))
  const handleChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (e) => {
      let newValue = parseInt(e.target.value)
      if (isNaN(newValue)) {
        newValue = 0
      }
      if (newValue !== value) {
        setValue(newValue)
        dispatchChange(newValue)
      }
    },
    [dispatchChange, value]
  )

  useEffect(() => {
    setValue(props.value ?? 0)
  }, [props.value])

  return (
    <TextField
      {...props}
      onChange={handleChange}
      value={value === 0 ? '' : value}
      type="text"
      inputMode="numeric"
      size="small"
      InputProps={{ inputProps: { pattern: '[0-9]{1,3}', style: { textAlign: 'right', padding: 4 } } }}
    ></TextField>
  )
}
