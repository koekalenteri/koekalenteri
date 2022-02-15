import { HelpOutlined } from '@mui/icons-material';
import { Autocomplete, Fade, FormControl, Grid, IconButton, InputAdornment, InputLabel, MenuItem, Paper, Popover, Select, TextField } from '@mui/material';
import { add, differenceInDays, eachDayOfInterval, isAfter, isSameDay, startOfDay } from 'date-fns';
import { Event, EventClass, Official, Organizer } from 'koekalenteri-shared/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection, DateRange, EventClasses, PartialEvent } from '.';

type EventFormBasicInfoParams = {
  event: PartialEvent
  eventTypes: string[]
  eventTypeClasses: Record<string, string[]>
  officials: Official[]
  organizers: Organizer[]
  onChange: (props: Partial<Event>) => void
};

export function EventFormBasicInfo({ event, eventTypes, eventTypeClasses, officials, organizers, onChange }: EventFormBasicInfoParams) {
  const { t } = useTranslation();
  const [helpAnchorEl, setHelpAnchorEl] = useState<HTMLButtonElement | null>(null);
  const helpOpen = Boolean(helpAnchorEl);
  const typeOptions = eventClassOptions(event, eventTypeClasses[event.eventType || ''] || []);

  return (
    <CollapsibleSection title="Kokeen perustiedot">
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 600 }}>
            <DateRange
              startLabel="Alkupäivä"
              endLabel="Loppupäivä"
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
            <TextField fullWidth label="Kennelliiton kokeen tunnus" InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={(e) => setHelpAnchorEl(e.currentTarget)}>
                    <HelpOutlined />
                  </IconButton>
                </InputAdornment>
              )
            }} />
            <Popover
              anchorEl={helpAnchorEl}
              open={helpOpen}
              anchorOrigin={{
                vertical: 'center',
                horizontal: 'center',
              }}
              transformOrigin={{
                vertical: 'top',
                horizontal: 'left',
              }}
              TransitionComponent={Fade}
              onClose={() => setHelpAnchorEl(null)}
            >
              <Paper sx={{ maxWidth: 400, p: 1, backgroundColor: 'secondary.light' }}>
                Saat Kennelliiton kokeen tunnuksen Oma koirasta, kun koe on anottu ja hyväksytty Kennelliitossa. Kokeen tunnusta tarvitaan tulosten tallentamiseen.
              </Paper>
            </Popover>
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <FormControl fullWidth required error={!event.eventType}>
              <InputLabel id="eventType-label">{t('eventType')}</InputLabel>
              <Select
                labelId="eventType-label"
                id="eventType-select"
                value={event.eventType}
                label={t('eventType')}
                onChange={(e) => onChange({ eventType: e.target.value })}
              >
                {eventTypes.map((type) => <MenuItem key={type} value={type}>{type}</MenuItem>)}
              </Select>
            </FormControl>
          </Grid>
          <Grid item sx={{ width: 600 }}>
            <EventClasses
              id="class"
              event={event}
              value={event.classes}
              classes={typeOptions}
              label={t("eventClasses")}
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
            <Autocomplete
              id="organizer"
              disableClearable
              getOptionLabel={o => o.name || ''}
              value={event.organizer || {id: 0, name: ''}}
              options={organizers}
              renderInput={(params) => <TextField {...params} label={t("organizer")} />}
              onChange={(e, value) => onChange({ organizer: value })}
            />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <Autocomplete
              id="location"
              disableClearable
              freeSolo
              value={event.location}
              options={[]}
              renderInput={(params) => <TextField {...params} label={t("location")} />}
              onChange={(e, value) => onChange({ location: value })}
            />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 450 }}>
            <Autocomplete
              id="official"
              disableClearable
              getOptionLabel={o => o.name || ''}
              value={event.official || {id: 0, name: '', email: '', phone: '', location: '', eventTypes: []}}
              options={officials}
              renderInput={(params) => <TextField {...params} label={t("official")} />}
              onChange={(e, value) => onChange({ official: value })}
            />
          </Grid>
          <Grid item sx={{ width: 450 }}>
            <Autocomplete
              id="secretary"
              disableClearable
              getOptionLabel={o => o.name || ''}
              value={event.secretary || {id: 0, name: '', email: '', phone: '', location: ''}}
              options={officials}
              renderInput={(params) => <TextField {...params} label={t("secretary")} />}
              onChange={(e, value) => onChange({ secretary: value })}
            />
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
