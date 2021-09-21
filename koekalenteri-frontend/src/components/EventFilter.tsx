import { Checkbox, FormControl, Grid, InputLabel, ListItemText, MenuItem, Select, SelectProps } from '@mui/material';
import { Box } from '@mui/system';
import { Judge } from 'koekalenteri-shared/model/Judge';
import { FilterProps } from '../stores/EventStrore';
import DateRange from './DateRange';

type EventFilterProps = {
  judges: Judge[]
  filter: FilterProps
  onChange?: (filter: FilterProps) => void
}

type MultiSelectOption = {
  value: string,
  name: string
}

function stringsToMultiSelectOptions(opts: string[]): MultiSelectOption[] {
  return opts.map(o => ({ value: o, name: o }));
}

function MultiSelect(props: SelectProps<string[]> & { options: MultiSelectOption[] }) {
  return (
    <Select
      {...props}
      multiple
      renderValue={(selected) => selected.join(', ')}
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

export default function EventFilter({ judges, filter, onChange }: EventFilterProps) {
  const multiValue = (value: string | string[]) => typeof value === 'string' ? value.split(',') : value;
  const multiNumber = (value: string | string[]) => multiValue(value).map(v => +v);
  const setFilter = (props: Partial<FilterProps>) => {
    onChange && onChange(Object.assign({}, filter, props));
  }

  return (
    <Box m={1}>
      <Grid container justifyContent="space-around" >
        <Grid container item xs={12}>
          <Grid item xs={12} md={6}>
            <DateRange start={filter.start} startLabel={"Aikaväli alkaen"} end={filter.end} endLabel={"Aikaväli päättyen"} onChange={(start, end) => setFilter({ start, end })}></DateRange>
          </Grid>
          <Grid item xs={12} md={6}>
            <FormControl sx={{ mr: 1, width: '45%', minWidth: 150 }}>
              <InputLabel id="type-label">Koetyyppi</InputLabel>
              <MultiSelect
                id="type"
                labelId="type-label"
                label={"Koetyyppi"}
                value={filter.eventType}
                onChange={(event) => setFilter({ eventType: multiValue(event.target.value) })}
                options={stringsToMultiSelectOptions(['NOU', 'NOME-B', 'NOME-A', 'NOWT'])}
              />
            </FormControl>
            <FormControl sx={{ width: '45%', minWidth: 150 }}>
              <InputLabel id="class-label">Koeluokka</InputLabel>
              <MultiSelect
                id="class"
                labelId="class-label"
                label={"Koeluokka"}
                value={filter.eventClass}
                onChange={(event) => setFilter({ eventClass: multiValue(event.target.value) })}
                options={stringsToMultiSelectOptions(['ALO', 'AVO', 'VOI'])}
              />
            </FormControl>
          </Grid>
        </Grid>
        <Grid container item spacing={3} xs={12}>
          <Grid item xs={12} md={6}>TODO: Yhdistys</Grid>
          <Grid item xs={12} md={6}>
            <FormControl sx={{ width: '100%', minWidth: 150 }}>
              <InputLabel id="judge-label">Tuomari</InputLabel>
              <MultiSelect
                id="judge"
                labelId="judge-label"
                label={"Tuomari"}
                value={filter.judge.map(n => n.toString())}
                onChange={(event) => setFilter({ judge: multiNumber(event.target.value) })}
                options={judges.map(j => ({value: j.id.toString(), name: j.name}))}
              />
            </FormControl>
          </Grid>
        </Grid>
        <Grid container item spacing={3} xs={12}>
          <Grid item xs={12}>TODO: Switchit</Grid>
        </Grid>
      </Grid>
    </Box>
  );
}
