import { Grid, TextField } from '@mui/material';
import { add, differenceInDays, eachDayOfInterval, isAfter, isSameDay, startOfDay } from 'date-fns';
import { Event, EventClass, Official, Organizer } from 'koekalenteri-shared/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection, DateRange, EventClasses, PartialEvent } from '.';
import { HelpPopover } from './HelpPopover';
import { ValidatedAutocomplete } from './ValidatedAutocomplete';
import { FieldRequirements } from './EventForm.validation';

type EventFormBasicInfoParams = {
  event: PartialEvent
  fields: FieldRequirements
  eventTypes: string[]
  eventTypeClasses: Record<string, string[]>
  officials: Official[]
  organizers: Organizer[]
  onChange: (props: Partial<Event>) => void
};


export function EventFormBasicInfo({ event, fields, eventTypes, eventTypeClasses, officials, organizers, onChange }: EventFormBasicInfoParams) {
  const { t } = useTranslation('event');
  const [helpAnchorEl, setHelpAnchorEl] = useState<HTMLButtonElement | null>(null);
  const typeOptions = eventClassOptions(event, eventTypeClasses[event.eventType || ''] || []);

  return (
    <CollapsibleSection title="Kokeen perustiedot">
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 600 }}>
            <DateRange
              startLabel={t('startDate')}
              endLabel={t('endDate')}
              start={event.startDate}
              end={event.endDate}
              required
              onChange={(start, end) => {
                start = start || event.startDate;
                end = end || event.endDate;
                if (!isSameDay(start, event.startDate) && isSameDay(end, event.endDate)) {
                  // startDate changed and endDate remained the same => change endDate based on the previous distance between days
                  end = add(start, { days: differenceInDays(event.endDate, event.startDate) });
                }
                onChange({
                  startDate: start,
                  endDate: end,
                  classes: updateClassDates(event, start, end)
                })
              }
              }
            />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <ValidatedAutocomplete
              id="kcId"
              freeSolo
              event={event}
              fields={fields}
              options={[]}
              onChange={onChange}
              helpClick={(e) => setHelpAnchorEl(e.currentTarget)}
            />
            <HelpPopover anchorEl={helpAnchorEl} onClose={() => setHelpAnchorEl(null)}>{t('kcId_info')}</HelpPopover>
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <ValidatedAutocomplete id="eventType" event={event} fields={fields} options={eventTypes} onChange={onChange} />
          </Grid>
          <Grid item sx={{ width: 600 }}>
            <EventClasses
              id="class"
              event={event}
              required={fields.required.classes}
              value={event.classes}
              classes={typeOptions}
              label={t("classes")}
              onChange={(e, values) => onChange({ classes: values })}
            />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 600 }}>
            <TextField label="Tapahtuman nimi" fullWidth value={event.name || ''} onChange={(e) => onChange({ name: e.target.value })} />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 600 }}>
            <ValidatedAutocomplete id="organizer" event={event} fields={fields} options={organizers} getOptionLabel={o => o?.name || ''} onChange={onChange} />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <ValidatedAutocomplete id="location" event={event} fields={fields} options={[]} freeSolo onChange={onChange} />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 450 }}>
            <ValidatedAutocomplete id="official" event={event} fields={fields} options={officials} getOptionLabel={o => o?.name || ''} onChange={onChange} />
          </Grid>
          <Grid item sx={{ width: 450 }}>
            <ValidatedAutocomplete id="secretary" event={event} fields={fields} options={officials} getOptionLabel={o => o?.name || ''} onChange={onChange} />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}

function eventClassOptions(event: PartialEvent, typeClasses: string[]) {
  const days = eachDayOfInterval({
    start: event.startDate,
    end: event.endDate
  });
  const result: EventClass[] = [];
  for (const day of days) {
    result.push(...typeClasses.map(c => ({
      class: c,
      date: day,
    })));
  }
  return result;
}

function updateClassDates(event: PartialEvent, start: Date, end: Date) {
  const result: EventClass[] = [];
  for (const c of event.classes) {
    c.date = startOfDay(add(start, { days: differenceInDays(c.date || event.startDate, event.startDate) }));
    if (!isAfter(c.date, end)) {
      result.push(c);
    }
  }
  return result;
}
