import type { StandardTextFieldProps } from '@mui/material'
import type { ChangeEventHandler } from 'react'

import { useCallback, useEffect, useState } from 'react'
import TextField from '@mui/material/TextField'

import useDebouncedCallback from '../../hooks/useDebouncedCallback'

interface Props extends Omit<StandardTextFieldProps, 'onChange'> {
  readonly value?: number
  readonly onChange?: (value: number | undefined) => void
}

export const NumberInput = (props: Props) => {
  const [value, setValue] = useState<number | undefined>(props.value)

  const dispatchChange = useDebouncedCallback((value: number | undefined) => props.onChange?.(value))
  const handleChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (e) => {
      let newValue: number | undefined = parseInt(e.target.value)
      if (isNaN(newValue)) {
        newValue = undefined
      }
      if (newValue !== value) {
        setValue(newValue)
        dispatchChange(newValue)
      }
    },
    [dispatchChange, value]
  )

  useEffect(() => {
    setValue(props.value)
  }, [props.value])

  return (
    <TextField
      {...props}
      onChange={handleChange}
      value={value ?? ''}
      type="text"
      inputMode="numeric"
      size="small"
      InputProps={{
        ...props.InputProps,
        inputProps: {
          pattern: '[0-9]{1,3}',
          style: { textAlign: 'right', padding: 4, ...props.InputProps?.inputProps },
        },
      }}
    ></TextField>
  )
}
