import { FormControl, Grid, InputLabel, MenuItem, Select } from '@mui/material';
import { Box } from '@mui/system';
import { FilterProps } from '../stores/EventStrore';
import DateRange from './DateRange';

type EventFilterProps = {
  filter: FilterProps
  onChange?: (filter: FilterProps) => void
}

export default function EventFilter({ filter, onChange }: EventFilterProps) {
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
              <Select id="type" labelId="type-label" label={"Koetyyppi"} value={filter.eventType} onChange={(event) => setFilter({ eventType: event.target.value })}>
                <MenuItem value=''><em>Kaikki</em></MenuItem>
                <MenuItem value='NOU'>NOU</MenuItem>
                <MenuItem value='NOME-B'>NOME-B</MenuItem>
                <MenuItem value='NOME-A'>NOME-A</MenuItem>
                <MenuItem value='NOWT'>NOWT</MenuItem>
              </Select>
            </FormControl>
            <FormControl sx={{ width: '45%', minWidth: 150 }}>
              <InputLabel id="class-label">Koeluokka</InputLabel>
              <Select id="class" labelId="class-label" label={"Koeluokka"} value={filter.eventClass} onChange={(event) => setFilter({ eventClass: event.target.value })}>
                <MenuItem value=''><em>Kaikki</em></MenuItem>
                <MenuItem value='ALO'>ALO</MenuItem>
                <MenuItem value='AVO'>AVO</MenuItem>
                <MenuItem value='VOI'>VOI</MenuItem>
              </Select>
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
