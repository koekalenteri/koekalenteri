import { CheckBox, CheckBoxOutlineBlank } from '@mui/icons-material'
import { Autocomplete, AutocompleteProps, Checkbox, TextField } from '@mui/material'

type OmitProps =
  | 'disableCloseOnSelect'
  | 'fullWidth'
  | 'freeSolo'
  | 'multiple'
  | 'renderInput'
  | 'renderOption'
  | 'renderTags'

export type AutocompleteMultiProps<T> = Omit<AutocompleteProps<T, true, false, false>, OmitProps> & {
  error?: boolean
  helperText?: string
  label: string
}

export default function AutocompleteMulti<T>(props: AutocompleteMultiProps<T>) {
  const { error, helperText, label, disabled, ...acProps } = props
  const getLabel = props.getOptionLabel ?? ((o?: T) => o ?? '')

  return (
    <Autocomplete
      autoHighlight
      disabled={disabled || (acProps.options.length === 0 && acProps.value?.length === 0)}
      data-testid={label}
      {...acProps}
      disableCloseOnSelect
      fullWidth
      multiple
      renderInput={(inputProps) => <TextField {...inputProps} label={label} error={error} helperText={helperText} />}
      renderOption={(optionProps, option, { selected }) => (
        <li {...optionProps}>
          <>
            <Checkbox
              icon={<CheckBoxOutlineBlank fontSize="small" />}
              checkedIcon={<CheckBox fontSize="small" />}
              style={{ marginRight: 8 }}
              checked={selected}
            />
            {getLabel(option)}
          </>
        </li>
      )}
    />
  )
}
