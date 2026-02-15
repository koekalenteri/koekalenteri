import type { AutocompleteProps } from '@mui/material'
import CheckBox from '@mui/icons-material/CheckBox'
import CheckBoxOutlineBlank from '@mui/icons-material/CheckBoxOutlineBlank'
import Autocomplete from '@mui/material/Autocomplete'
import Checkbox from '@mui/material/Checkbox'
import TextField from '@mui/material/TextField'

type OmitProps =
  | 'disableCloseOnSelect'
  | 'fullWidth'
  | 'freeSolo'
  | 'multiple'
  | 'renderInput'
  | 'renderOption'
  | 'renderTags'

type AutocompleteMultiProps<T> = Omit<AutocompleteProps<T, true, false, false>, OmitProps> & {
  error?: boolean
  helperText?: string
  label: string
}

export default function AutocompleteMulti<T>(props: AutocompleteMultiProps<T>) {
  const { error, helperText, label, disabled, ...acProps } = props
  const getLabel = props.getOptionLabel ?? ((o?: T): string => (o as string) ?? '')

  return (
    <Autocomplete
      autoHighlight
      disabled={disabled || (acProps.options.length === 0 && acProps.value?.length === 0)}
      data-testid={label}
      {...acProps}
      fullWidth
      multiple
      renderInput={(inputProps) => <TextField {...inputProps} label={label} error={error} helperText={helperText} />}
      renderOption={({ key, ...optionProps }, option, { selected }) => (
        <li key={key} {...optionProps}>
          <Checkbox
            icon={<CheckBoxOutlineBlank fontSize="small" />}
            checkedIcon={<CheckBox fontSize="small" />}
            style={{ marginRight: 8 }}
            checked={selected}
          />
          {getLabel(option)}
        </li>
      )}
    />
  )
}
