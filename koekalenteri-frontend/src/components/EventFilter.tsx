import { Checkbox, FormControl, Grid, InputLabel, ListItemText, MenuItem, Select, SelectProps } from '@mui/material';
import { Box } from '@mui/system';
import { FilterProps } from '../stores/EventStrore';
import DateRange from './DateRange';

type EventFilterProps = {
  filter: FilterProps
  onChange?: (filter: FilterProps) => void
}

function MultiSelect(props: SelectProps<string[]> & {options: string[]}) {
  return (
    <Select
      {...props}
      multiple
      renderValue={(selected) => selected.join(', ')}
    >
      {props.options.map((value) => (
        <MenuItem key={value} value={value}>
          <Checkbox checked={props.value?.includes(value)} />
          <ListItemText primary={value} />
        </MenuItem>
      ))}
    </Select>
  );
}

export default function EventFilter({ filter, onChange }: EventFilterProps) {
  const multiValue = (value: string | string[]) => typeof value === 'string' ? value.split(',') : value;
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
                options={['NOU', 'NOME-B', 'NOME-A', 'NOWT']}
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
                options={['ALO', 'AVO', 'VOI']}
              />
            </FormControl>
          </Grid>
        </Grid>
        <Grid container item spacing={3} xs={12}>
          <Grid item xs={12} md={6}>TODO: Yhdistys</Grid>
          <Grid item xs={12} md={6}>TODO: Tuomari</Grid>
        </Grid>
        <Grid container item spacing={3} xs={12}>
          <Grid item xs={12}>TODO: Switchit</Grid>
        </Grid>
      </Grid>
    </Box>
  );
}
