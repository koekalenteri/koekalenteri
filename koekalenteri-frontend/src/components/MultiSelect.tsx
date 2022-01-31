import { Checkbox, ListItemText, MenuItem, Select, SelectProps } from "@mui/material";

export type MultiSelectOption = {
  value: string,
  name: string
}

type onMultiSelectChange = (value: string[]) => void;

export function stringsToMultiSelectOptions(opts: string[]): MultiSelectOption[] {
  return opts.map(o => ({ value: o, name: o }));
}

export const multiSelectValue = (value: string | string[]) => typeof value === 'string' ? value.split(',') : value;

const defaultValueRender = (selected: string[]) => selected.join(', ');

export function MultiSelect(props: Omit<SelectProps<string[]>, 'onChange'> & { onChange: onMultiSelectChange, options: MultiSelectOption[] }) {
  const renderValue = props.renderValue || defaultValueRender;
  return (
    <Select
      {...props}
      onChange={(e) => props.onChange(multiSelectValue(e.target.value).sort((a, b) => props.options.findIndex(o => o.value === a) - props.options.findIndex(o => o.value === b)))}
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
