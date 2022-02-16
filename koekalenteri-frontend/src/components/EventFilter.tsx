import { Box, FormControl, FormControlLabel, Grid, InputLabel, Stack, Switch } from '@mui/material';
import { Judge, Organizer } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { FilterProps } from '../stores/PublicStore';
import { DateRange, MultiSelect, stringsToMultiSelectOptions } from '.';

type EventFilterProps = {
  judges: Judge[],
  organizers: Organizer[],
  filter: FilterProps
  onChange?: (filter: FilterProps) => void
}

export function EventFilter({ judges, organizers, filter, onChange }: EventFilterProps) {
  const { t } = useTranslation();
  const multiNumber = (value: string[]) => value.map(v => +v);
  const setFilter = (props: Partial<FilterProps>) => {
    onChange && onChange(Object.assign({}, filter, props));
  }

  return (
    <Box m={1}>
      <Grid container justifyContent="space-around" spacing={1}>
        <Grid item xs={12} md={6} xl={2}>
          <DateRange start={filter.start} startLabel={t("daterangeStart")} end={filter.end} endLabel={t("daterangeEnd")} onChange={(start, end) => setFilter({ start, end })}></DateRange>
        </Grid>
        <Grid item xs={6} md={3} xl>
          <FormControl sx={{ width: '100%' }}>
            <InputLabel id="type-label">{t("eventType")}</InputLabel>
            <MultiSelect
              id="type"
              labelId="type-label"
              label={t("eventType")}
              value={filter.eventType}
              onChange={(value) => setFilter({ eventType: value })}
              options={stringsToMultiSelectOptions(['NOU', 'NOME-B', 'NOME-A', 'NOWT'])}
            />
          </FormControl>
        </Grid>
        <Grid item xs={6} md={3} xl>
          <FormControl sx={{ width: '100%' }}>
            <InputLabel id="class-label">{t("eventClass")}</InputLabel>
            <MultiSelect
              id="class"
              labelId="class-label"
              label={t("eventClass")}
              value={filter.eventClass}
              onChange={(value) => setFilter({ eventClass: value })}
              options={stringsToMultiSelectOptions(['ALO', 'AVO', 'VOI'])}
            />
          </FormControl>
        </Grid>
        <Grid item xs={12} md={6} xl={2}>
          <FormControl sx={{ width: '100%' }}>
            <InputLabel id="organizer-label">{t("organizer")}</InputLabel>
            <MultiSelect
              id="organizer"
              labelId="organizer-label"
              label={t("organizer")}
              value={filter.organizer.map(n => n.toString())}
              onChange={(value) => setFilter({ organizer: multiNumber(value) })}
              options={organizers.map(o => ({value: o.id.toString(), name: o.name}))}
            />
          </FormControl>
        </Grid>
        <Grid item xs={12} md={6} xl={2}>
          <FormControl sx={{ width: '100%' }}>
            <InputLabel id="judge-label">{t("judge")}</InputLabel>
            <MultiSelect
              id="judge"
              labelId="judge-label"
              label={t("judge")}
              value={filter.judge.map(n => n.toString())}
              onChange={(value) => setFilter({ judge: multiNumber(value) })}
              options={judges.map(j => ({value: j.id.toString(), name: j.name}))}
            />
          </FormControl>
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
