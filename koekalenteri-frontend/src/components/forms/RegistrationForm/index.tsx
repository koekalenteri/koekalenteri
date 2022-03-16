import { Save, Cancel } from '@mui/icons-material';
import { LoadingButton } from '@mui/lab';
import { Box, Button, Checkbox, FormControl, FormControlLabel, FormHelperText, Link, Stack } from '@mui/material';
import { ConfirmedEventEx, Language, Registration } from 'koekalenteri-shared/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EntryInfo } from './1.Entry';
import { DogInfo } from './2.Dog';
import { BreederInfo } from './3.Breeder';
import { OwnerInfo } from './4.OwnerInfo';
import { HandlerInfo } from './5.HandlerInfo';
import { QualifyingResultsInfo } from './6.QualifyingResultsInfo';
import { AdditionalInfo } from './7.AdditionalInfo';
import { filterRelevantResults, validateRegistration } from './validation';

type FormEventHandler = (registration: Registration) => Promise<boolean>;
type RegistrationFormProps = {
  event: ConfirmedEventEx
  className?: string
  classDate?: string
  onSave?: FormEventHandler
  onCancel?: FormEventHandler
};

export function RegistrationForm({ event, className, classDate, onSave, onCancel }: RegistrationFormProps) {
  const { t, i18n } = useTranslation();
  const [local, setLocal] = useState<Registration>({
    eventId: event.id,
    eventType: event.eventType,
    language: i18n.language as Language,
    class: className || '',
    dates: [],
    reserve: '',
    dog: {
      regNo: '',
      dob: undefined,
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
    agreeToPublish: false
  });
  const [qualifies, setQualifies] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [changes, setChanges] = useState(local.id === '');
  const [errors, setErrors] = useState(validateRegistration(local));
  const valid = errors.length === 0;

  const onChange = (props: Partial<Registration>) => {
    console.log('Changes: ' + JSON.stringify(props));
    if (props.class || props.dog) {
      const c = props.class || local.class;
      const dog = props.dog || local.dog;
      const { relevant, qualifies } = filterRelevantResults(event.eventType, c as 'ALO' | 'AVO' | 'VOI', dog.results);
      setQualifies(qualifies);
      props.qualifyingResults = relevant;
    }
    const newState = { ...local, ...props };
    setErrors(validateRegistration(newState));
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
    dog: `${local.dog.regNo} - ${local.dog.name}`
  };
  for (const error of errors) {
    helperTexts[error.opts.field] = t(`validation.registration.${error.key}`, error.opts);
    errorStates[error.opts.field] = true;
  }

  return (
    <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'auto' }}>
      <Box sx={{ pb: 0.5, overflow: 'auto', borderRadius: 1, bgcolor: 'background.form', '& .MuiInputBase-root': { bgcolor: 'background.default'} }}>
        <EntryInfo reg={local} event={event} classDate={classDate} errorStates={errorStates} helperTexts={helperTexts} onChange={onChange} />
        <DogInfo reg={local} eventDate={event.startDate} minDogAgeMonths={9} error={errorStates.dog} helperText={helperTexts.dog} onChange={onChange} />
        <BreederInfo />
        <OwnerInfo reg={local} onChange={onChange} />
        <HandlerInfo reg={local} onChange={onChange} />
        <QualifyingResultsInfo reg={local} qualifies={qualifies} onChange={onChange} />
        <AdditionalInfo />
        <FormControl error={errorStates.agreeToTerms}>
          <FormControlLabel control={<Checkbox checked={local.agreeToTerms} onChange={e => onChange({agreeToTerms: e.target.checked}) }/>} label={
            <>
              <span>{t('registration.terms.read')}</span>&nbsp;
              <Link target="_blank" rel="noopener" href="https://yttmk.yhdistysavain.fi/noutajien-metsastyskokeet-2/ohjeistukset/kokeen-ja-tai-kilpailun-ilmoitta/">{t('registration.terms.terms')}</Link>
            &nbsp;<span>{t('registration.terms.agree')}</span>
            </>
          } />
        </FormControl>
        <FormHelperText error>{helperTexts.agreeToTerms}</FormHelperText>
        <FormControlLabel control={<Checkbox required />} label="Hyväksyn, että kokeen järjestämisen vastuuhenkilöt voivat käsitellä ilmoittamiani henkilötietoja ja julkaista niitä tarpeen mukaan kokeen osallistuja- ja tulosluettelossa koepaikalla ja kokeeseen liittyvissä julkaisuissa internetissä tai muissa yhdistyksen medioissa." />
      </Box>

      <Stack spacing={1} direction="row" justifyContent="flex-end" sx={{mt: 1}}>
        <LoadingButton color="primary" disabled={!changes || !valid} loading={saving} loadingPosition="start" startIcon={<Save />} variant="contained" onClick={saveHandler}>Tallenna</LoadingButton>
        <Button startIcon={<Cancel />} variant="outlined" onClick={cancelHandler}>Peruuta</Button>
      </Stack>
    </Box>
  );
}
