import { SyntheticEvent, useCallback, useMemo } from 'react'
import { Autocomplete, AutocompleteChangeDetails, AutocompleteChangeReason, AutocompleteProps, TextField } from '@mui/material'


type OmitProps =  'fullWidth' | 'freeSolo' | 'multiple' | 'renderInput' | 'onChange';

type Props<T, DisableClearable extends boolean | undefined> = Omit<AutocompleteProps<T, false, DisableClearable, false>, OmitProps> & {
  error?: boolean
  helperText?: string
  label: string
  onChange?: (value: DisableClearable extends true ? NonNullable<T> : T | null) => void
}

export default function AutocompleteSingle<T, DisableClearable extends boolean | undefined>(props: Props<T, DisableClearable>) {
  const { error, helperText, label, value, options, color, isOptionEqualToValue, onChange, onInputChange, ...acProps } = props
  const handleChange = useCallback((event: SyntheticEvent<Element, Event>, value: DisableClearable extends true ? NonNullable<T> : T | null, reason: AutocompleteChangeReason, details?: AutocompleteChangeDetails<T> | undefined) => {
    onChange?.(value)
  }, [onChange])

  // @ts-expect-error Type 'null' is not assignable to type 'DisableClearable extends true ? NonNullable<T> : T | null'
  const fixedValue: (DisableClearable extends true ? NonNullable<T> : T | null) = value === undefined ? null : value
  const compareOption = useMemo(() => isOptionEqualToValue ?? ((option: T, value: T) => option === value), [isOptionEqualToValue])
  const validOption = useMemo(() => fixedValue === null || props.options.find(option => compareOption(option, fixedValue)), [compareOption, fixedValue, props.options])
  const fixedOptions = useMemo(() => validOption || fixedValue === null ? options : [...options, fixedValue], [validOption, fixedValue, options])

  return (
    <Autocomplete<T, false, DisableClearable, false>
      autoHighlight
      data-testid={label}
      {...acProps}
      value={fixedValue}
      options={fixedOptions}
      multiple={false}
      fullWidth
      isOptionEqualToValue={compareOption}
      onChange={handleChange}
      renderInput={(inputProps) => <TextField {...inputProps} label={label} error={error} helperText={helperText} />}
    />
  )
}
