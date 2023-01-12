import { SyntheticEvent, useCallback, useState } from "react"
import { Autocomplete, AutocompleteInputChangeReason, AutocompleteProps, TextField } from "@mui/material"


type OmitProps =  'fullWidth' | 'freeSolo' | 'multiple' | 'renderInput';

type Props<T, DisableClearable extends boolean | undefined> = Omit<AutocompleteProps<T, false, DisableClearable, false>, OmitProps> & {
  error?: boolean
  helperText?: string
  label: string
}

export default function AutocompleteSingle<T, DisableClearable extends boolean | undefined>(props: Props<T, DisableClearable>) {
  const { error, helperText, label, value, inputValue, onInputChange, ...acProps } = props
  const [controlledInputValue, setControlledInputValue] = useState(inputValue ?? '')
  const handleInputChange = useCallback((event: SyntheticEvent<Element, Event>, value: string, reason: AutocompleteInputChangeReason) => {
    setControlledInputValue(value)
    onInputChange?.(event, value, reason)
  }, [onInputChange])

  return (
    <Autocomplete
      autoHighlight
      data-testid={label}
      {...acProps}
      multiple={false}
      fullWidth
      inputValue={controlledInputValue}
      onInputChange={handleInputChange}
      renderInput={(inputProps) => <TextField {...inputProps} label={label} error={error} helperText={helperText} />}
    />
  )
}
