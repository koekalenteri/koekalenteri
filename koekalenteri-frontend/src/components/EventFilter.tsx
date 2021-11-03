import { Checkbox, FormControl, FormControlLabel, FormGroup, Grid, InputLabel, ListItemText, MenuItem, Select, SelectProps, Switch } from '@mui/material';
import { Box } from '@mui/system';
import { Judge, Organizer } from 'koekalenteri-shared';
import { FilterProps } from '../stores/EventStrore';
import { DateRange } from './DateRange';

type EventFilterProps = {
  judges: Judge[],
  organizers: Organizer[],
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

export function EventFilter({ judges, organizers, filter, onChange }: EventFilterProps) {
  const multiValue = (value: string | string[]) => typeof value === 'string' ? value.split(',') : value;
  const multiNumber = (value: string | string[]) => multiValue(value).map(v => +v);
  const setFilter = (props: Partial<FilterProps>) => {
    onChange && onChange(Object.assign({}, filter, props));
  }

  return (
    <Box m={1}>
      <Grid container justifyContent="space-around" spacing={1}>
        <Grid item xs={12} md={6} xl={3}>
          <DateRange start={filter.start} startLabel={"Aikaväli alkaen"} end={filter.end} endLabel={"Aikaväli päättyen"} onChange={(start, end) => setFilter({ start, end })}></DateRange>
        </Grid>
        <Grid item xs={12} md={6} xl>
          <FormControl sx={{ width: '100%' }}>
            <InputLabel id="type-label">Koemuoto</InputLabel>
            <MultiSelect
              id="type"
              labelId="type-label"
              label={"Koemuoto"}
              value={filter.eventType}
              onChange={(event) => setFilter({ eventType: multiValue(event.target.value) })}
              options={stringsToMultiSelectOptions(['NOU', 'NOME-B', 'NOME-A', 'NOWT'])}
            />
          </FormControl>
        </Grid>
        <Grid item xs={12} md={6} xl>
          <FormControl sx={{ width: '100%' }}>
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
        <Grid item xs={12} md={6} xl={2}>
          <FormControl sx={{ width: '100%' }}>
            <InputLabel id="organizer-label">Järjestäjä</InputLabel>
            <MultiSelect
              id="organizer"
              labelId="organizer-label"
              label={"Järjestäjä"}
              value={filter.organizer.map(n => n.toString())}
              onChange={(event) => setFilter({ organizer: multiNumber(event.target.value) })}
              options={organizers.map(o => ({value: o.id.toString(), name: o.name}))}
            />
          </FormControl>
        </Grid>
        <Grid item xs={12} md={6} xl={2}>
          <FormControl sx={{ width: '100%' }}>
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
        <Grid item container xs={12} md={6} xl={3}>
          <FormGroup sx={{ width: '100%' }} row>
            <FormControlLabel
              value="withOpenEntry"
              checked={filter.withOpenEntry}
              control={<Switch />}
              label="Ilmoittautuminen auki"
              labelPlacement="start"
              onChange={(_event, checked) => setFilter({ withOpenEntry: checked })}
            />
            <FormControlLabel
              value="withFreePlaces"
              checked={filter.withFreePlaces}
              control={<Switch />}
              label="Vielä mahtuu"
              labelPlacement="start"
              onChange={(_event, checked) => setFilter({ withFreePlaces: checked })}
            />
          </FormGroup>
          <FormGroup sx={{ width: '100%' }} row>
            <FormControlLabel
              value="withUpcomingEntry"
              checked={filter.withUpcomingEntry}
              control={<Switch />}
              label="Ilmoittautuminen tulossa"
              labelPlacement="start"
              onChange={(_event, checked) => setFilter({ withUpcomingEntry: checked })}
            />
            <FormControlLabel
              value="withClosingEntry"
              checked={filter.withClosingEntry}
              control={<Switch />}
              label="Vielä ehdit!"
              labelPlacement="start"
              onChange={(_event, checked) => setFilter({ withClosingEntry: checked })}
            />
          </FormGroup>
        </Grid>
      </Grid>
    </Box>
  );
}
