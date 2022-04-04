import { Cancel, Save } from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import { Box, Button, Checkbox, FormControl, FormControlLabel, FormHelperText, Link, Paper, Stack } from '@mui/material';
import { ConfirmedEventEx, Language, Registration } from 'koekalenteri-shared/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EntryInfo, getRegistrationDates } from './1.Entry';
import { DogInfo } from './2.Dog';
import { BreederInfo } from './3.Breeder';
import { OwnerInfo } from './4.OwnerInfo';
import { HandlerInfo } from './5.HandlerInfo';
import { QualifyingResultsInfo } from './6.QualifyingResultsInfo';
import { AdditionalInfo } from './7.AdditionalInfo';
import { RegistrationClass } from './rules';
import { filterRelevantResults, validateRegistration } from './validation';

type FormEventHandler = (registration: Registration) => Promise<boolean>;
type RegistrationFormProps = {
  event: ConfirmedEventEx
  registration?: Registration
  className?: string
  classDate?: string
  onSave?: FormEventHandler
  onCancel?: FormEventHandler
};

export function RegistrationForm({ event, className, registration, classDate, onSave, onCancel }: RegistrationFormProps) {
  const { t, i18n } = useTranslation();
  const [local, setLocal] = useState<Registration>({
    eventId: event.id,
    id: '',
    eventType: event.eventType,
    language: i18n.language as Language,
    class: className || '',
    dates: getRegistrationDates(event, classDate, className || ''),
    reserve: 'ANY',
    dog: {
      regNo: '',
      refreshDate: undefined,
      results: []
    },
    breeder: {
      name: '',
      location: ''
    },
    owner: {
      name: '',
      phone: '',
      email: '',
      location: '',
      membership: false
    },
    handler: {
      name: '',
      phone: '',
      email: '',
      location: '',
      membership: false
    },
    qualifyingResults: [],
    notes: '',
    agreeToTerms: false,
    agreeToPublish: false,
    createdAt: new Date(),
    createdBy: '',
    modifiedAt: new Date(),
    modifiedBy: '',
    ...registration
  });
  const [qualifies, setQualifies] = useState<boolean|null>(local.id ? filterRelevantResults(event, local.class as RegistrationClass, local.dog.results).qualifies : null);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState(local.id === '');
  const [errors, setErrors] = useState(validateRegistration(local, event));
  const valid = errors.length === 0;
  const onChange = (props: Partial<Registration>) => {
    console.log('Changes: ' + JSON.stringify(props));
    if (props.class && !props.dates) {
      const allCount = getRegistrationDates(event, classDate, local.class || '').length;
      const available = getRegistrationDates(event, classDate, props.class);
      if (local.dates.length === allCount) {
        local.dates = available;
      } else {
        props.dates = local.dates.filter(rd => available.find(a => a.date.valueOf() === rd.date.valueOf() && a.time === rd.time));
      }
    }
    if (props.class || props.dog || props.results) {
      const c = props.class || local.class;
      const dog = props.dog || local.dog;
      const filtered = filterRelevantResults(event, c as RegistrationClass, dog.results, props.results || local.results);
      setQualifies((!dog || !c) ? null : filtered.qualifies);
      props.qualifyingResults = filtered.relevant;
    }
    if (props.ownerHandles || (props.owner && local.ownerHandles)) {
      props.handler = { ...local.owner, ...props.owner }
    }
    if (props.handler && local.ownerHandles && props.ownerHandles !== false) {
      props.owner = { ...props.handler }
    }
    const newState = { ...local, ...props };
    setErrors(validateRegistration(newState, event));
    setLocal(newState);
    setChanges(true);
    setSaving(false);
  }
  const saveHandler = async () => {
    setSaving(true);
    if (onSave && await onSave(local) === false) {
      setSaving(false);
    }
  }
  const cancelHandler = () => onCancel && onCancel(local);

  const errorStates: { [Property in keyof Registration]?: boolean } = {};
  const helperTexts: { [Property in keyof Registration]?: string } = {
    breeder: `${local.breeder.name}`,
    dog: `${local.dog.regNo} - ${local.dog.name}`,
    handler: local.handler.name === local.owner.name ? t('registration.ownerHandles') : `${local.handler.name}`,
    owner: `${local.owner.name}`,
    qualifyingResults: qualifies === null ? '' : t('registration.qualifyingResultsInfo', {qualifies: t(qualifies ? 'registration.qyalifyingResultsYes' : 'registration.qualifyingResultsNo') }),
  };
  for (const error of errors) {
    helperTexts[error.opts.field] = t(`validation.registration.${error.key}`, error.opts);
    errorStates[error.opts.field] = true;
  }

  return (
    <Paper elevation={2} sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'auto', maxHeight: '100%' }}>
      <Box sx={{ pb: 0.5, overflow: 'auto', borderRadius: 1, bgcolor: 'background.form', '& .MuiInputBase-root': { bgcolor: 'background.default'} }}>
        <EntryInfo reg={local} event={event} classDate={classDate} errorStates={errorStates} helperTexts={helperTexts} onChange={onChange} />
        <DogInfo reg={local} eventDate={event.startDate} minDogAgeMonths={9} error={errorStates.dog} helperText={helperTexts.dog} onChange={onChange} />
        <BreederInfo reg={local} error={errorStates.breeder} helperText={helperTexts.breeder} onChange={onChange} />
        <OwnerInfo reg={local} error={errorStates.owner} helperText={helperTexts.owner} onChange={onChange} />
        <HandlerInfo reg={local} error={errorStates.handler} helperText={helperTexts.handler} onChange={onChange} />
        <QualifyingResultsInfo reg={local} error={!qualifies} helperText={helperTexts.qualifyingResults} onChange={onChange} />
        <AdditionalInfo reg={local} onChange={onChange} />
        <Box sx={{ m: 1, mt: 2, ml: 4, borderTop: '1px solid #bdbdbd' }}>
          <FormControl error={errorStates.agreeToTerms} disabled={!!local.id}>
            <FormControlLabel control={<Checkbox checked={local.agreeToTerms} onChange={e => onChange({agreeToTerms: e.target.checked})}/>} label={
              <>
                <span>{t('registration.terms.read')}</span>&nbsp;
                <Link target="_blank" rel="noopener" href="https://yttmk.yhdistysavain.fi/noutajien-metsastyskokeet-2/ohjeistukset/kokeen-ja-tai-kilpailun-ilmoitta/">{t('registration.terms.terms')}</Link>
            &nbsp;<span>{t('registration.terms.agree')}</span>
              </>
            } />
          </FormControl>
          <FormHelperText error>{helperTexts.agreeToTerms}</FormHelperText>
          <FormControl error={errorStates.agreeToPublish} disabled={!!local.id}>
            <FormControlLabel control={<Checkbox checked={local.agreeToPublish} onChange={e => onChange({ agreeToPublish: e.target.checked })} />} label={t('registration.terms.publish')} />
          </FormControl>
          <FormHelperText error>{helperTexts.agreeToPublish}</FormHelperText>
        </Box>
      </Box>

      <Stack spacing={1} direction="row" justifyContent="flex-end" sx={{p: 1, borderTop: '1px solid', borderColor: '#bdbdbd'}}>
        <LoadingButton color="primary" disabled={!changes || !valid} loading={saving} loadingPosition="start" startIcon={<Save />} variant="contained" onClick={saveHandler}>Tallenna</LoadingButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={cancelHandler}>Peruuta</Button>
      </Stack>
    </Paper>
  );
}
