import { AddOutlined, CheckBox, CheckBoxOutlineBlank, Remove } from '@mui/icons-material';
import { Autocomplete, Avatar, Button, Checkbox, Chip, FormControl, Grid, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import { isSameDay } from 'date-fns';
import { Event, EventClass, Judge } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection } from './CollapsibleSection';

function filterJudges(judges: Judge[], eventJudges: number[], id: number) {
  return judges.filter(j => j.id === id || !eventJudges.includes(j.id));
}

export type PartialEventWithJudgesAndClasses = Partial<Event> & { startDate: Date, judges: Array<number>, classes: Array<EventClass> };

export function EventFormJudges({ event, judges, onChange }: { event: PartialEventWithJudgesAndClasses, judges: Judge[], onChange: (props: Partial<Event>) => void }) {
  const { t } = useTranslation();
  const list = event.judges.length ? event.judges : [0];
  return (
    <CollapsibleSection title={t('judges')}>
      <Grid item container spacing={1}>
        {list.map((id, index) => {
          const title = index === 0 ? 'Ylituomari' : `Tuomari ${index + 1}`;
          return (
            <Grid key={id} item container spacing={1} alignItems="center">
              <Grid item>
                <FormControl sx={{ width: 300 }}>
                  <InputLabel id={`judge${index}-label`}>{title}</InputLabel>
                  <Select
                    labelId={`judge${index}-label`}
                    id={`judge${index}-select`}
                    value={id}
                    label={title}
                    onChange={(e) => {
                      const newJudges = [...event.judges];
                      newJudges.splice(index, 1, e.target.value as number);
                      onChange({ judges: newJudges })
                    }}
                  >
                    {filterJudges(judges, event.judges, id).map((judge) => <MenuItem key={judge.id} value={judge.id}>{judge.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item sx={{width: 300}}>
                <Autocomplete
                  id="class"
                  fullWidth
                  disableClearable
                  disableCloseOnSelect
                  disabled={!event.classes?.length}
                  multiple
                  value={event.classes.filter(c => c.judge && c.judge.id === id)}
                  groupBy={c => t('weekday', { date: c.date })}
                  options={event.classes || []}
                  onChange={(e, values) => onChange({ classes: event.classes.map(c => values.find(v => isSameDay(v.date || event.startDate, c.date || event.startDate) && v.class === c.class) ? { ...c, judge: { id, name: judges.find(j => j.id === id)?.name || '' } } : c) })}
                  getOptionLabel={c => c.class}
                  isOptionEqualToValue={(o, v) => o.date === v.date && o.class === v.class}
                  renderOption={(props, option, { selected }) => (
                    <li {...props}>
                      <Checkbox
                        icon={<CheckBoxOutlineBlank fontSize="small" />}
                        checkedIcon={<CheckBox fontSize="small" />}
                        style={{ marginRight: 8 }}
                        checked={selected}
                      />
                      {option.class}
                    </li>
                  )}
                  renderInput={(params) => <TextField {...params} label="Arvostelee koeluokat" />}
                  renderTags={(tagValue, getTagProps) => tagValue.map((option, index) => (
                    <Chip
                      avatar={<Avatar sx={{ fontWeight: 'bold', bgcolor: isSameDay(option.date || event.startDate, event.startDate) ? 'secondary.light' : 'secondary.dark' }}>{t('weekday', { date: option.date })}</Avatar>}
                      size="small"
                      label={option.class}
                      variant="outlined"
                      {...getTagProps({ index })}
                      onDelete={undefined}
                    />
                  ))}
                />
              </Grid>
              <Grid item>
                <Button startIcon={<Remove />} onClick={() => onChange({judges: event.judges.filter(j => j !== id), classes: event.classes.map(c => c.judge?.id === id ? {...c, judge: undefined} : c)})}>Poista tuomari</Button>
              </Grid>
            </Grid>
          );
        })}
        <Grid item><Button startIcon={<AddOutlined />} onClick={() => onChange({ judges: [...event.judges].concat(0) })}>Lisää tuomari</Button></Grid>
      </Grid>
    </CollapsibleSection>
  );
}
