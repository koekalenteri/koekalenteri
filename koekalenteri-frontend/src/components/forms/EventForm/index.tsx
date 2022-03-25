import { Cancel, Save } from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import { Box, Button, Stack } from '@mui/material';
import { addDays, nextSaturday, startOfDay } from 'date-fns';
import type { Event, EventClass, EventState, Judge, Official, Organizer } from 'koekalenteri-shared/model';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { requiredFields, validateEvent } from './validation';
import { AdditionalInfoSection } from './7.AdditionalInfoSection';
import { BasicInfoSection } from './1.BasicInfoSection';
import { ContactInfoSection } from './6.ContactInfoSection';
import { EntrySection } from './3.EntrySection';
import { HeadquartersSection } from './5.HeadquartersSection';
import { JudgesSection } from './2.JudgesSection';
import { PaymentSection } from './4.PaymentSection';
import { AutocompleteSingle } from '../..';

export type FormEventHandler = (event: Partial<Event>) => Promise<boolean>;
export type PartialEvent = Partial<Event> & { startDate: Date, endDate: Date, classes: EventClass[], judges: number[] };
type EventFormParams = {
  event: Partial<Event>
  eventTypes: string[]
  eventTypeClasses: Record<string, string[]>
  judges: Judge[]
  officials: Official[]
  organizers: Organizer[]
  onSave: FormEventHandler
  onCancel: FormEventHandler
};

export function EventForm({ event, judges, eventTypes, eventTypeClasses, officials, organizers, onSave, onCancel }: EventFormParams) {
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
  const [changes, setChanges] = useState(typeof local.id === 'undefined');
  const [errors, setErrors] = useState(validateEvent(local));
  const valid = errors.length === 0;
  const fields = useMemo(() => requiredFields(local), [local]);
  const onChange = (props: Partial<Event>) => {
    const tmp: any = {};
    Object.keys(props).forEach(k => {tmp[k] = (local as any)[k]});
    console.log('changed: ' + JSON.stringify(props), JSON.stringify(tmp));
    if (props.eventType && eventTypeClasses[props.eventType].length === 0) {
      props.classes = [];
    }
    const newState = { ...local, ...props };
    setErrors(validateEvent(newState));
    setLocal(newState);
    setChanges(true);
  }
  const saveHandler = async () => {
    setSaving(true);
    if (await onSave(local) === false) {
      setSaving(false);
    }
  }
  const cancelHandler = () => onCancel(local);

  const errorStates: { [Property in keyof Event]?: boolean } = {};
  const helperTexts: { [Property in keyof Event]?: string } = {};
  for (const error of errors) {
    helperTexts[error.opts.field] = t(`validation.event.${error.key}`, error.opts);
    errorStates[error.opts.field] = true;
  }

  return (
    <>
      <Box sx={{ pb: 1 }}>
        <AutocompleteSingle
          disableClearable
          getOptionLabel={o => t(`event.states.${o}`)}
          label={t('event.state')}
          onChange={(e, value) => onChange({state: value || undefined})}
          options={['draft', 'tentative', 'confirmed', 'cancelled'] as EventState[]}
          value={local.state}
          sx={{width: 200}}
        />
      </Box>

      <Box sx={{ pb: 0.5, overflow: 'auto', borderRadius: 1, bgcolor: 'background.form', '& .MuiInputBase-root': { bgcolor: 'background.default'} }}>
        <BasicInfoSection event={local} fields={fields} errorStates={errorStates} helperTexts={helperTexts} eventTypes={eventTypes} eventTypeClasses={eventTypeClasses} officials={officials} organizers={organizers} onChange={onChange} />
        <JudgesSection event={local} judges={judges} fields={fields} onChange={onChange} />
        <EntrySection event={local} fields={fields} errorStates={errorStates} helperTexts={helperTexts} onChange={onChange} />
        <PaymentSection event={local} fields={fields} onChange={onChange} />
        <HeadquartersSection event={local} onChange={onChange} />
        <ContactInfoSection event={local} errorStates={errorStates} helperTexts={helperTexts} fields={fields} onChange={onChange} />
        <AdditionalInfoSection event={local} onChange={onChange} />
      </Box>

      <Stack spacing={1} direction="row" justifyContent="flex-end" sx={{mt: 1}}>
        <LoadingButton color="primary" disabled={!changes || !valid} loading={saving} loadingPosition="start" startIcon={<Save />} variant="contained" onClick={saveHandler}>Tallenna</LoadingButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={cancelHandler}>Peruuta</Button>
      </Stack>
    </>
  );
}
