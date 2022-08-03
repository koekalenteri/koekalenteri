import { AddOutlined, DeleteOutline } from '@mui/icons-material';
import { Button, FormHelperText, Grid } from '@mui/material';
import { isSameDay } from 'date-fns';
import { Event, EventClass, Judge } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection, PartialEvent } from '../..';
import { AutocompleteSingle } from '../../AutocompleteSingle';
import { EventClasses } from './EventClasses';
import { FieldRequirements, validateEventField } from './validation';

function filterJudges(judges: Judge[], eventJudges: number[], id: number, eventType?: string) {
  return judges
    .filter(j => !eventType || j.eventTypes.includes(eventType))
    .filter(j => j.id === id || !eventJudges.includes(j.id));
}

type JudgesSectionProps = {
  event: PartialEvent
  fields?: FieldRequirements
  judges: Judge[]
  onChange: (props: Partial<Event>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

export function JudgesSection({ event, judges, fields, onChange, onOpenChange, open }: JudgesSectionProps) {
  const { t } = useTranslation();
  const list = event.judges.length ? event.judges : [0];
  const error = fields?.required.judges && validateEventField(event, 'judges', true);
  const helperText = error ? t(`validation.event.${error.key}`, { ...error.opts, state: fields.state.judges || 'draft' }) : '';

  const updateJudge = (id: number | undefined, values: EventClass[]) => {
    const judge = id ? { id, name: judges.find(j => j.id === id)?.name || '' } : undefined;
    const isSelected = (c: EventClass) => values.find(v => isSameDay(v.date || event.startDate, c.date || event.startDate) && v.class === c.class);
    const wasSelected = (c: EventClass) => c.judge?.id === id;
    const previousOrUndefined = (c: EventClass) => wasSelected(c) ? undefined : c.judge;
    return event.classes.map(c => ({
      ...c,
      judge: isSelected(c) ? judge : previousOrUndefined(c)
    }));
  }

  return (
    <CollapsibleSection title={t('judges')} open={open} onOpenChange={onOpenChange}>
      <Grid item container spacing={1}>
        {list.map((id, index) => {
          const title = index === 0 ? t('judgeChief') : t('judge') + ` ${index + 1}`;
          return (
            <Grid key={id} item container spacing={1} alignItems="center">
              <Grid item sx={{ width: 300 }}>
                <AutocompleteSingle
                  value={judges.find(j => j.id === id)}
                  label={title}
                  getOptionLabel={o => o?.name || ''}
                  options={filterJudges(judges, event.judges, id, event.eventType)}
                  onChange={(_e, value) => {
                    const newId = value?.id;
                    const newJudges = [...event.judges];
                    const oldId = newJudges.splice(index, 1)[0]
                    if (newId) {
                      newJudges.splice(index, 0, newId);
                    }
                    onChange({
                      judges: newJudges,
                      classes: updateJudge(newId, event.classes.filter(c => c.judge && c.judge.id === oldId))
                    })
                  }}
                />
              </Grid>
              <Grid item sx={{ width: 300 }}>
                <EventClasses
                  id={`class${index}`}
                  event={event}
                  value={event.classes.filter(c => c.judge && c.judge.id === id)}
                  classes={[...event.classes]}
                  label="Arvostelee koeluokat"
                  onChange={(_e, values) => onChange({
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
