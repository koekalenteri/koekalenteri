import { Cancel, Save } from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import { Box, Button, Paper, Stack, Theme, useMediaQuery } from '@mui/material';
import { addDays, nextSaturday, startOfDay } from 'date-fns';
import type { Event, EventClass, EventEx, EventState, Judge, Official, Organizer } from 'koekalenteri-shared/model';
import { observer } from 'mobx-react-lite';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AutocompleteSingle } from '../..';
import { BasicInfoSection } from './1.BasicInfoSection';
import { JudgesSection } from './2.JudgesSection';
import { EntrySection } from './3.EntrySection';
import { PaymentSection } from './4.PaymentSection';
import { HeadquartersSection } from './5.HeadquartersSection';
import { ContactInfoSection } from './6.ContactInfoSection';
import { AdditionalInfoSection } from './7.AdditionalInfoSection';
import { requiredFields, validateEvent } from './validation';

export type FormEventHandler = (event: Partial<Event>) => Promise<boolean>;
export type PartialEvent = Partial<Event> & { startDate: Date, endDate: Date, classes: EventClass[], judges: number[] };
type EventFormParams = {
  event: Partial<EventEx>
  eventTypes: string[]
  eventTypeClasses: Record<string, string[]>
  judges: Judge[]
  officials: Official[]
  organizers: Organizer[]
  onSave: FormEventHandler
  onCancel: FormEventHandler
};

export const EventForm = observer(function EventForm({ event, judges, eventTypes, eventTypeClasses, officials, organizers, onSave, onCancel }: EventFormParams) {
  const md = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'));
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
  const [open, setOpen] = useState<{[key: string]: boolean|undefined}>({
    basic: true,
    judges: md,
    entry: md,
    payment: md,
    hq: md,
    contact: md,
    info: md
  });
  const valid = errors.length === 0;
  const fields = useMemo(() => requiredFields(local), [local]);
  const onChange = (props: Partial<Event>) => {
    const tmp: any = {};
    Object.keys(props).forEach(k => {tmp[k] = (local as any)[k]});
    console.log('changed: ' + JSON.stringify(props), JSON.stringify(tmp));
    if (props.eventType && (eventTypeClasses[props.eventType] || []).length === 0) {
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
  const handleOpenChange = (id: keyof typeof open, value: boolean) => {
    const newState = md
      ? {
        ...open,
        [id]: value
      }
      : {
        basic: false,
        judges: false,
        entry: false,
        payment: false,
        hq: false,
        contact: false,
        info: false,
        [id]: value
      };
    setOpen(newState);
  }

  const errorStates: { [Property in keyof Event]?: boolean } = {};
  const helperTexts: { [Property in keyof Event]?: string } = {};
  for (const error of errors) {
    helperTexts[error.opts.field] = t(`validation.event.${error.key}`, error.opts);
    errorStates[error.opts.field] = true;
  }

  return (
    <Paper elevation={2} sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'auto', maxHeight: '100%', maxWidth: '100%' }}>
      <Box sx={{ p: 1 }}>
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

      <Box sx={{ pb: 0.5, overflow: 'auto', bgcolor: 'background.form', '& .MuiInputBase-root': { bgcolor: 'background.default'} }}>
        <BasicInfoSection
          errorStates={errorStates}
          event={local}
          eventTypeClasses={eventTypeClasses}
          eventTypes={eventTypes}
          fields={fields}
          helperTexts={helperTexts}
          officials={officials}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('basic', value)}
          open={open.basic}
          organizers={organizers}
        />
        <JudgesSection
          event={local}
          judges={judges}
          fields={fields}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('judges', value)}
          open={open.judges}
        />
        <EntrySection
          event={local}
          fields={fields}
          errorStates={errorStates}
          helperTexts={helperTexts}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('entry', value)}
          open={open.entry}
        />
        <PaymentSection
          errorStates={errorStates}
          event={local}
          fields={fields}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('payment', value)}
          open={open.payment}
        />
        <HeadquartersSection
          event={local}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('hq', value)}
          open={open.hq}
        />
        <ContactInfoSection
          event={local}
          errorStates={errorStates}
          helperTexts={helperTexts}
          fields={fields}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('contact', value)}
          open={open.contact}
        />
        <AdditionalInfoSection
          event={local}
          onChange={onChange}
          onOpenChange={(value) => handleOpenChange('info', value)}
          open={open.info}
        />
      </Box>

      <Stack spacing={1} direction="row" justifyContent="flex-end" sx={{p: 1, borderTop: '1px solid', borderColor: '#bdbdbd'}}>
        <LoadingButton color="primary" disabled={!changes || !valid} loading={saving} loadingPosition="start" startIcon={<Save />} variant="contained" onClick={saveHandler}>Tallenna</LoadingButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={cancelHandler}>Peruuta</Button>
      </Stack>
    </Paper>
  );
})
