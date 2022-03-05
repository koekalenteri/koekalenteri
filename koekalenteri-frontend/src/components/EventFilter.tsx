import { Box, FormControlLabel, Grid, Stack, Switch } from '@mui/material';
import { Judge, Organizer } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { FilterProps } from '../stores/PublicStore';
import { AutocompleteMulti, DateRange } from '.';

type EventFilterProps = {
  judges: Judge[],
  organizers: Organizer[],
  filter: FilterProps
  onChange?: (filter: FilterProps) => void
}

export function EventFilter({ judges, organizers, filter, onChange }: EventFilterProps) {
  const { t } = useTranslation();
  const setFilter = (props: Partial<FilterProps>) => {
    onChange && onChange(Object.assign({}, filter, props));
  }

  return (
    <Box m={1}>
      <Grid container justifyContent="space-around" spacing={1}>
        <Grid item xs={12} md={6} xl={2}>
          <DateRange start={filter.start} startLabel={t("daterangeStart")} end={filter.end} endLabel={t("daterangeEnd")} onChange={(start, end) => setFilter({ start, end })}></DateRange>
        </Grid>
        <Grid item xs={12} sm={6} md={4} xl>
          <AutocompleteMulti
            label={t('eventType')}
            onChange={(e, value) => setFilter({ eventType: value })}
            options={['NOU', 'NOME-B', 'NOME-A', 'NOWT']}
            value={filter.eventType}
          />
        </Grid>
        <Grid item xs={12} sm={6} md={2} xl>
          <AutocompleteMulti
            label={t('eventClass')}
            onChange={(e, value) => setFilter({ eventClass: value })}
            options={['ALO', 'AVO', 'VOI']}
            value={filter.eventClass}
          />
        </Grid>
        <Grid item xs={12} sm={6} xl={2}>
          <AutocompleteMulti
            getOptionLabel={o => o.name}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            label={t('organizer')}
            onChange={(e, value) => setFilter({ organizer: value.map(v => +v.id) })}
            options={organizers}
            value={organizers.filter(o => filter.organizer.includes(o.id))}
          />
        </Grid>
        <Grid item xs={12} sm={6} xl={2}>
          <AutocompleteMulti
            getOptionLabel={o => o.name}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            label={t('judge')}
            onChange={(e, value) => setFilter({ judge: value.map(v => +v.id) })}
            options={judges}
            value={judges.filter(j => filter.judge.includes(j.id))}
          />
        </Grid>
        <Grid item md={12} xl={4}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={0} alignItems="start" justifyContent="space-evenly">
            <Box sx={{display: 'flex'}}>
              <FormControlLabel
                value="withOpenEntry"
                checked={filter.withOpenEntry}
                control={<Switch />}
                label={t('entryOpen')}
                onChange={(_event, checked) => setFilter({
                  withOpenEntry: checked,
                  withClosingEntry: checked && filter.withClosingEntry,
                  withFreePlaces: checked && filter.withFreePlaces
                })}
              />
              <Box sx={{display: 'inline-grid'}}>
                <FormControlLabel
                  value="withClosingEntry"
                  checked={filter.withClosingEntry}
                  control={<Switch color="secondary" size="small" />}
                  label="Vielä ehdit!"
                  onChange={(_event, checked) => setFilter({
                    withOpenEntry: filter.withOpenEntry || checked,
                    withClosingEntry: checked
                  })}
                />
                <FormControlLabel
                  value="withFreePlaces"
                  checked={filter.withFreePlaces}
                  control={<Switch color="secondary" size="small" />}
                  label="Vielä mahtuu"
                  onChange={(_event, checked) => setFilter({
                    withOpenEntry: filter.withOpenEntry || checked,
                    withFreePlaces: checked
                  })}
                />
              </Box>
            </Box>
            <FormControlLabel
              value="withUpcomingEntry"
              checked={filter.withUpcomingEntry}
              control={<Switch />}
              label="Ilmoittautuminen tulossa"
              labelPlacement="end"
              onChange={(_event, checked) => setFilter({ withUpcomingEntry: checked })}
            />
          </Stack>
        </Grid>
      </Grid>
    </Box>
  );
}
