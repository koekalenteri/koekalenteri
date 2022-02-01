import { AddOutlined, Remove } from '@mui/icons-material';
import { Button, Checkbox, FormControl, FormControlLabel, FormGroup, FormLabel, Grid, InputLabel, MenuItem, Select } from '@mui/material';
import { format } from 'date-fns';
import { Event, EventClass, Judge } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection } from './CollapsibleSection';

function filterJudges(judges: Judge[], eventJudges: number[], id: number) {
  return judges.filter(j => j.id === id || !eventJudges.includes(j.id));
}

export type PartialEventWithJudgesAndClasses = Partial<Event> & { judges: Array<number>, classes: Array<EventClass> };

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
              <Grid item>
                <FormControl component="fieldset">
                  <FormLabel component="legend">Arvostelee koeluokat</FormLabel>
                  <FormGroup row>
                    {event.classes.map((c, i) => {
                      const classDate = format(c.date || event.startDate || new Date(), t('dateformatS'));
                      return (
                        <FormControlLabel
                          key={c.class + classDate}
                          value={c.class}
                          control={<Checkbox
                            checked={c.judge?.id === id}
                            disabled={!id || (c.judge && c.judge.id !== id)}
                            onChange={(e) => {
                              const classes = [...event.classes];
                              classes[i].judge = e.target.checked && id ? { id, name: judges.find(j => j.id === id)?.name || '' } : undefined;
                              return onChange({ classes });
                            }}
                            size="small"
                          />}
                          label={`${c.class} ${classDate}`}
                        />
                      );
                    })}
                  </FormGroup>
                </FormControl>
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
