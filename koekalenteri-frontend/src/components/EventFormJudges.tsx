import { AddOutlined, DeleteOutline } from '@mui/icons-material';
import { Button, FormControl, FormHelperText, Grid, InputLabel, MenuItem, Select } from '@mui/material';
import { isSameDay } from 'date-fns';
import { Event, EventClass, Judge } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection, EventClasses, PartialEvent } from '.';
import { FieldRequirements, validateEventField } from './EventForm.validation';

function filterJudges(judges: Judge[], eventJudges: number[], id: number) {
  return judges.filter(j => j.id === id || !eventJudges.includes(j.id));
}

export function EventFormJudges({ event, judges, fields, onChange }: { event: PartialEvent, judges: Judge[], fields?: FieldRequirements, onChange: (props: Partial<Event>) => void }) {
  const { t } = useTranslation('event');
  const list = event.judges.length ? event.judges : [0];
  const error = fields?.required.judges && validateEventField(event, 'judges');
  const helperText = error ? t(error.key, { ...error.opts, state: fields.state.judges || 'draft' }) : '';

  const updateJudge = (id: number, values: EventClass[]) => {
    const judge = { id, name: judges.find(j => j.id === id)?.name || '' };
    const isSelected = (c: EventClass) => values.find(v => isSameDay(v.date || event.startDate, c.date || event.startDate) && v.class === c.class);
    const wasSelected = (c: EventClass) => c.judge?.id === id;
    return event.classes.map(c => ({
      ...c,
      judge: isSelected(c)
        ? judge
        : wasSelected(c)
          ? undefined
          : c.judge
    }));
  }

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
                      const newId = e.target.value as number;
                      const newJudges = [...event.judges];
                      const oldId = newJudges.splice(index, 1, newId)[0];
                      onChange({
                        judges: newJudges,
                        classes: updateJudge(newId, event.classes.filter(c => c.judge && c.judge.id === oldId))
                      })
                    }}
                  >
                    {filterJudges(judges, event.judges, id).map((judge) => <MenuItem key={judge.id} value={judge.id}>{judge.name}</MenuItem>)}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item sx={{ width: 300 }}>
                <EventClasses
                  id={`class${index}`}
                  event={event}
                  value={event.classes.filter(c => c.judge && c.judge.id === id)}
                  classes={[...event.classes]}
                  label="Arvostelee koeluokat"
                  onChange={(e, values) => onChange({
                    classes: updateJudge(id, values)
                  })}
                />
              </Grid>
              <Grid item>
                <Button startIcon={<DeleteOutline />} onClick={() => onChange({judges: event.judges.filter(j => j !== id), classes: event.classes.map(c => c.judge?.id === id ? {...c, judge: undefined} : c)})}>Poista tuomari</Button>
              </Grid>
            </Grid>
          );
        })}
        <Grid item><Button startIcon={<AddOutlined />} onClick={() => onChange({ judges: [...event.judges].concat(0) })}>Lisää tuomari</Button></Grid>
      </Grid>
      <FormHelperText error>{helperText}</FormHelperText>
    </CollapsibleSection>
  );
}
