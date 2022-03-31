import { CachedOutlined } from '@mui/icons-material';
import { DatePicker, LoadingButton } from '@mui/lab';
import { Autocomplete, FormControl, FormHelperText, Grid, Stack, TextField } from '@mui/material';
import { differenceInMinutes, subMonths, subYears } from 'date-fns';
import { BreedCode, Dog, DogGender, Registration } from 'koekalenteri-shared/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AutocompleteSingle, CollapsibleSection } from '../..';
import { getDog } from '../../../api/dog';
import { useLocalStorage } from '../../../stores';
import { unique } from '../../../utils';

export function shouldAllowRefresh(dog?: Partial<Dog>) {
  if (!dog || !dog.regNo) {
    return false;
  }
  if (dog.refreshDate && differenceInMinutes(new Date(), dog.refreshDate) <= 5) {
    return false;
  }
  return !!dog.refreshDate;
}

type DogInfoProps = {
  reg: Registration
  eventDate: Date
  minDogAgeMonths: number
  error?: boolean
  helperText?: string
  onChange: (props: Partial<Registration>) => void
};

export function DogInfo({ reg, eventDate, minDogAgeMonths, error, helperText, onChange }: DogInfoProps ) {
  const { t } = useTranslation();
  const { t: breed } = useTranslation('breed');
  const [loading, setLoading] = useState(false);
  const [dogs, setDogs] = useLocalStorage('dogs', '');
  const [regNo, setRegNo] = useState<string>(reg.dog.regNo);
  const [disabled, setDisabled] = useState(true);
  const [dogHelper, setDogHelper] = useState(reg.dog.refreshDate ? t('since', {date: reg.dog.refreshDate}) : '');
  const [dogHelperError, setDogHelperError] = useState(false);
  const [buttonText, setButtonText] = useState(reg.id ? 'Päivitä' : 'Hae tiedot');
  const [mode, setMode] = useState('fetch');
  const allowRefresh = shouldAllowRefresh(reg.dog);
  const loadDog = async (value?: string, refresh?: boolean) => {
    setRegNo(value || '');
    if (!value) {
      return;
    }
    value = value.toUpperCase();
    console.log(value);
    setLoading(true);
    const lookup = await getDog(value, refresh);
    setLoading(false);
    setDisabled(true);
    const storedDogs = dogs?.split(',') || [];
    if (lookup && lookup.regNo) {
      storedDogs.push(lookup.regNo);
      setDogs(unique(storedDogs).filter(v => v !== '').join(','));
      setDogHelper(t('since', {date: lookup.refreshDate}));
      setDogHelperError(false);
      setRegNo(lookup.regNo);
      setButtonText('Päivitä');
      onChange({ dog: { ...reg.dog, ...lookup } });
    } else {
      setDogHelper('Rekisterinumerolla ei löytynyt tietoja');
      setDogHelperError(true);
      setButtonText('Syötä tiedot käsin');
      if (storedDogs.includes(value)) {
        setDogs(storedDogs.filter(v => v !== value).join(','));
      }
      onChange({ dog: { regNo: value, dob: new Date(), results: [] } });
    }
  };
  const buttonClick = () => {
    if (mode === 'fetch') {
      if (dogHelperError) {
        setMode('manual');
        setDogHelperError(false);
        setDogHelper('Syötä tiedot käsin');
        setButtonText('Tee uusi haku rekisterinumerolla');
        setDisabled(false);
      } else {
        loadDog(regNo, allowRefresh);
      }
    } else {
      setMode('fetch');
      setButtonText('Hae tiedot');
    }
  }
  return (
    <CollapsibleSection title={t('registration.dog')} error={error} helperText={helperText}>
      <Stack direction="row" spacing={1} alignItems="flex-end">
        <Autocomplete
          id="txtReknro"
          disabled={mode === 'manual'}
          freeSolo
          renderInput={(props) => <TextField {...props} error={!reg.dog.regNo} label={t('dog.regNo')}/>}
          value={regNo}
          onChange={(_e, value) => { loadDog(value || ''); }}
          onInputChange={(_e, value) => setRegNo(value)}
          options={dogs?.split(',') || []}
          sx={{minWidth: 200}}
        />
        <Stack alignItems="flex-start">
          <FormHelperText error={dogHelperError}>{dogHelper}</FormHelperText>
          <LoadingButton
            disabled={regNo === '' || (mode === 'fetch' && (regNo === reg.dog.regNo && !allowRefresh) && !dogHelperError)}
            startIcon={<CachedOutlined />}
            size="small"
            loading={loading}
            variant="outlined"
            color="info"
            onClick={buttonClick}
          >
            {buttonText}
          </LoadingButton>
        </Stack>
      </Stack>
      <Grid container spacing={1} sx={{mt: 0.5}}>
        <Grid item>
          <TextField
            disabled={disabled}
            fullWidth
            label={t('dog.rfid')}
            value={reg.dog.rfid || ''}
            error={!disabled && !reg.dog.rfid}
            onChange={(e) => onChange({ dog: { ...reg.dog, rfid: e.target.value } })}
          />
        </Grid>
        <Grid item sx={{ width: 300 }}>
          <AutocompleteSingle
            disableClearable
            disabled={disabled}
            getOptionLabel={(o) => breed(o)}
            label={t('dog.breed')}
            onChange={(_e, value) => onChange({ dog: { ...reg.dog, breedCode: value || undefined } })}
            options={['122', '111', '121', '312', '110', '263'] as BreedCode[]}
            value={reg.dog.breedCode || '122'}
          />
        </Grid>
        <Grid item xs={'auto'}>
          <FormControl sx={{ width: 146, mr: 0.5 }}>
            <DatePicker
              label={t('dog.dob')}
              disabled={disabled}
              value={reg.dog.dob || ''}
              mask={t('datemask')}
              inputFormat={t('dateformat')}
              minDate={subYears(new Date(), 15)}
              maxDate={subMonths(eventDate, minDogAgeMonths)}
              defaultCalendarMonth={subYears(new Date(), 2)}
              openTo={'year'}
              views={['year', 'month', 'day']}
              onChange={(value) => value && onChange({ dog: { ...reg.dog, dob: value } })}
              renderInput={(params) => <TextField {...params} />} />
          </FormControl>
        </Grid>
        <Grid item xs={'auto'} sx={{minWidth: 120}}>
          <AutocompleteSingle
            disableClearable
            disabled={disabled}
            value={reg.dog.gender || 'F'}
            label={t('dog.gender')}
            onChange={(_e, value) => onChange({ dog: { ...reg.dog, gender: value } })}
            options={['F', 'M'] as DogGender[]}
            getOptionLabel={o => t(`dog.gender_choises.${o}`)}
          />
        </Grid>
        <Grid item container spacing={1}>
          <TitlesAndName
            disabled={disabled}
            id="dog"
            name={reg.dog.name}
            nameLabel={t('dog.titles')}
            onChange={props => onChange({ dog: { ...reg.dog, ...props } })}
            titles={reg.dog.titles}
            titlesLabel={t('dog.titles')}
          />
        </Grid>
        <Grid item container spacing={1}>
          <TitlesAndName
            disabled={disabled}
            id="sire"
            name={reg.dog.sire?.name}
            nameLabel={t('dog.sire.name')}
            onChange={props => onChange({ dog: { ...reg.dog, sire: { ...reg.dog.sire, ...props } } })}
            titles={reg.dog.sire?.titles}
            titlesLabel={t('dog.sire.titles')}
          />
        </Grid>
        <Grid item container spacing={1}>
          <TitlesAndName
            disabled={disabled}
            id="dam"
            name={reg.dog.dam?.name}
            nameLabel={t('dog.dam.name')}
            onChange={props => onChange({ dog: { ...reg.dog, dam: { ...reg.dog.dam, ...props } } })}
            titles={reg.dog.dam?.titles}
            titlesLabel={t('dog.dam.titles')}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}

type TitlesAndNameProps = {
  disabled: boolean
  id: string
  name?: string
  nameLabel: String
  onChange: (props: {titles?: string, name?: string}) => void
  titles?: string
  titlesLabel: string
}
function TitlesAndName(props: TitlesAndNameProps) {
  return (
    <Grid item container spacing={1}>
      <Grid item>
        <TextField
          disabled={props.disabled}
          id={`${props.id}_titles`}
          label={props.titlesLabel}
          onChange={(e) => props.onChange({ titles: e.target.value })}
          sx={{ width: 300 }}
          value={props.titles || ''}
        />
      </Grid>
      <Grid item>
        <TextField
          disabled={props.disabled}
          error={!props.disabled && !props.name}
          id={`${props.id}_name`}
          label={props.nameLabel}
          onChange={(e) => props.onChange({ name: e.target.value })}
          sx={{ width: 300 }}
          value={props.name || ''}
        />
      </Grid>
    </Grid>
  );
}
