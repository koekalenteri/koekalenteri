import { Checkbox, ListItemText, MenuItem, Select, SelectProps } from "@mui/material";

export type MultiSelectOption = {
  value: string,
  name: string
}

export function stringsToMultiSelectOptions(opts: string[]): MultiSelectOption[] {
  return opts.map(o => ({ value: o, name: o }));
}

export const multiSelectValue = (value: string | string[]) => typeof value === 'string' ? value.split(',') : value;

const defaultValueRender = (selected: string[]) => selected.join(', ');
export function MultiSelect(props: SelectProps<string[]> & { options: MultiSelectOption[] }) {
  const renderValue = props.renderValue || defaultValueRender;
  return (
    <Select
      {...props}
      multiple
      renderValue={(selected) => renderValue(props.options
        .filter(opt => selected.includes(opt.value))
        .map(opt => opt.name))}
    >
      {props.options.map(({ value, name }) => (
        <MenuItem key={value} value={value}>
          <Checkbox checked={props.value?.includes(value)} />
          <ListItemText primary={name} />
        </MenuItem>
      ))}
    </Select>
  );
}
