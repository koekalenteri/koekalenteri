import { CheckBoxOutlineBlank, CheckBox } from "@mui/icons-material";
import { Autocomplete, AutocompleteProps, Checkbox, TextField } from "@mui/material";

type OmitProps =  'fullWidth' | 'freeSolo' | 'multiple' | 'renderInput';

export type AutocompleteSingleProps<T, DisableClearable extends boolean | undefined> = Omit<AutocompleteProps<T, false, DisableClearable, false>, OmitProps> & {
  helperText?: string
  label: string
}

export function AutocompleteSingle<T, DisableClearable extends boolean | undefined>(props: AutocompleteSingleProps<T, DisableClearable>) {
  const { helperText, label, ...acProps } = props;
  const getLabel = props.getOptionLabel || ((o: T) => o);

  return (
    <Autocomplete
      autoHighlight
      data-testid={label}
      {...acProps}
      multiple={false}
      fullWidth
      renderInput={(props) => <TextField {...props} label={label} helperText={helperText} />}
      renderOption={(props, option, { selected }) => (
        <li {...props}>
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
  );
}
