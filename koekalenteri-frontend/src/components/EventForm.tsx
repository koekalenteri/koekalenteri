import { Cancel, Save } from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import { Box, Button, FormControl, InputLabel, MenuItem, Select, Stack } from '@mui/material';
import { makeStyles } from '@mui/styles';
import { addDays, nextSaturday, startOfDay } from 'date-fns';
import type { Event, EventClass, EventState, Judge, Official, Organizer } from 'koekalenteri-shared/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EventFormAdditionalInfo, EventFormBasicInfo, EventFormContactInfo, EventFormEntry, EventFormJudges, EventFormHeadquarters, EventFormPayment } from '.';

const useStyles = makeStyles(theme => ({
  root: {
    backgroundColor: theme.palette.background.form,
    '& .MuiInputBase-root': {
      backgroundColor: theme.palette.background.default
    }
  }
}));

export type PartialEvent = Partial<Event> & { startDate: Date, endDate: Date, classes: EventClass[], judges: number[] };
export type EventHandler = (event: Partial<Event>) => Promise<boolean>;

type EventFormParams = {
  event: Partial<Event>
  eventTypes: string[]
  eventTypeClasses: Record<string, string[]>
  judges: Judge[]
  officials: Official[]
  organizers: Organizer[]
  onSave: EventHandler
  onCancel: EventHandler
};

export function EventForm({ event, judges, eventTypes, eventTypeClasses, officials, organizers, onSave, onCancel }: EventFormParams) {
  const classes = useStyles();
  const baseDate = startOfDay(addDays(Date.now(), 90));
  const { t } = useTranslation();
  const [local, setLocal] = useState<PartialEvent>({
    state: 'draft' as EventState,
    startDate: nextSaturday(baseDate),
    endDate: nextSaturday(baseDate),
    classes: [],
    judges: [],
    ...event
  });
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState(!('id' in event) || !('state' in event));
  const [valid, setValid] = useState(local.id ? true : !!local.eventType);
  const onChange = (props: Partial<Event>) => {
    if (props.eventType && eventTypeClasses[props.eventType].length === 0) {
      props.classes = [];
    }
    setLocal({ ...local, ...props });
    setChanges(true);
    if (!valid && props.eventType) {
      setValid(true);
    }
  }
  const saveHandler = async () => {
    setSaving(true);
    if (await onSave(local) === false) {
      setSaving(false);
    }
  }
  const cancelHandler = () => onCancel(local);

  return (
    <>
      <FormControl>
        <InputLabel id="state-label">{t('state')}</InputLabel>
        <Select
          labelId="state-label"
          id="state"
          value={local.state}
          label={t('state')}
          onChange={(e) => onChange({state: e.target.value as EventState})}
        >
          <MenuItem value="draft">{t('draft', { ns: 'states'})}</MenuItem>
          <MenuItem value="tentative">{t('tentative', { ns: 'states' })}</MenuItem>
          <MenuItem value="confirmed">{t('confirmed', { ns: 'states' })}</MenuItem>
          <MenuItem value="cancelled">{t('cancelled', { ns: 'states' })}</MenuItem>
        </Select>
      </FormControl>

      <Box className={classes.root} sx={{ pb: 0.5 }}>
        <EventFormBasicInfo event={local} eventTypes={eventTypes} eventTypeClasses={eventTypeClasses} officials={officials} organizers={organizers} onChange={onChange} />
        <EventFormJudges event={local} judges={judges} onChange={onChange} />
        <EventFormEntry event={local} onChange={onChange} />
        <EventFormPayment event={local} onChange={onChange} />
        <EventFormHeadquarters event={local} onChange={onChange} />
        <EventFormContactInfo event={local} onChange={onChange} />
        <EventFormAdditionalInfo event={local} onChange={onChange} />
      </Box>

      <Stack spacing={1} direction="row" justifyContent="flex-end" sx={{mt: 1}}>
        <LoadingButton color="primary" disabled={!changes ||!valid} loading={saving} loadingPosition="start" startIcon={<Save />} variant="contained" onClick={saveHandler}>Tallenna</LoadingButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={cancelHandler}>Peruuta</Button>
      </Stack>
    </>
  );
}
