import type { TextFieldProps } from '@mui/material'
import type { ChangeEventHandler } from 'react'

import { useCallback, useEffect, useState } from 'react'
import TextField from '@mui/material/TextField'

import useDebouncedCallback from '../../hooks/useDebouncedCallback'

interface Props extends Omit<TextFieldProps<'standard'>, 'onChange'> {
  readonly formatValue?: (value: number | undefined) => string
  readonly parseInput?: (value: string) => number
  readonly pattern?: string
  readonly value?: number
  readonly onChange?: (value: number | undefined) => void
}

const defaultFormatter = (value: number | undefined) => (value === undefined ? '' : `${value}`)

export const NumberInput = ({
  formatValue = defaultFormatter,
  parseInput = (value: string) => Number.parseInt(value, 10),
  pattern = '[0-9]{1,3}',
  value,
  onChange,
  ...props
}: Props) => {
  const [stringValue, setStringValue] = useState<string>(formatValue(value))
  const [focused, setFocused] = useState(false)

  const dispatchChange = useDebouncedCallback((value: number | undefined) => onChange?.(value))
  const handleChange = useCallback<ChangeEventHandler<HTMLInputElement>>(
    (e) => {
      if (e.target.value !== stringValue) {
        setStringValue(e.target.value)
      }
      let newValue: number | undefined = parseInput(e.target.value)
      if (Number.isNaN(newValue)) {
        newValue = undefined
      }
      if (newValue !== value) {
        dispatchChange(newValue)
      }
    },
    [dispatchChange, parseInput, stringValue, value]
  )

  const handleFocus = useCallback(() => setFocused(true), [])
  const handleBlur = useCallback(() => {
    setStringValue(formatValue(value))
    setFocused(false)
  }, [formatValue, value])

  useEffect(() => {
    if (!focused) setStringValue(formatValue(value))
  }, [focused, formatValue, value])

  return (
    <TextField
      {...props}
      onChange={handleChange}
      onBlur={handleBlur}
      onFocus={handleFocus}
      value={stringValue}
      type="text"
      inputMode="numeric"
      size="small"
      slotProps={{
        input: {
          ...props.slotProps?.input,
          inputProps: {
            pattern,
            // @ts-expect-error wtf
            style: { textAlign: 'right', padding: 4, ...props.slotProps?.input?.inputProps?.style },
          },
        },
      }}
    ></TextField>
  )
}
