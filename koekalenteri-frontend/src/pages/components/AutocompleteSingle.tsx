import { Autocomplete, AutocompleteProps, TextField } from "@mui/material"


type OmitProps =  'fullWidth' | 'freeSolo' | 'multiple' | 'renderInput';

type Props<T, DisableClearable extends boolean | undefined> = Omit<AutocompleteProps<T, false, DisableClearable, false>, OmitProps> & {
  error?: boolean
  helperText?: string
  label: string
}

export default function AutocompleteSingle<T, DisableClearable extends boolean | undefined>(props: Props<T, DisableClearable>) {
  const { error, helperText, label, ...acProps } = props

  return (
    <Autocomplete
      autoHighlight
      data-testid={label}
      {...acProps}
      multiple={false}
      fullWidth
      renderInput={(inputProps) => <TextField {...inputProps} label={label} error={error} helperText={helperText} />}
    />
  )
}
