import { CheckBoxOutlineBlank, CheckBox } from "@mui/icons-material";
import { Autocomplete, AutocompleteProps, Checkbox, TextField } from "@mui/material";
import { SizeMe } from 'react-sizeme'

type OmitProps = 'disableCloseOnSelect' | 'fullWidth' | 'freeSolo' | 'multiple' | 'renderInput' | 'renderOption' | 'renderTags';

export type AutocompleteMultiProps<T> = Omit<AutocompleteProps<T, true, false, false>, OmitProps> & {
  helperText?: string
  label: string
}

export function AutocompleteMulti<T>(props: AutocompleteMultiProps<T>) {
  const { helperText, label, ...acProps } = props;
  const getLabel = props.getOptionLabel || ((o: T) => o);

  return (
    <SizeMe>
      {({ size }) =>
        <Autocomplete
          autoHighlight
          data-testid={label}
          {...acProps}
          disableCloseOnSelect
          fullWidth
          limitTags={size.width ? Math.trunc((size.width - 64) / 100) : undefined}
          multiple
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
          sx={{
            '& .MuiAutocomplete-inputRoot': {
              flexWrap: 'nowrap',
              overflowX: 'hidden'
            }
          }}
        />
      }
    </SizeMe>
  );
}
