import { RefreshOutlined } from '@mui/icons-material';
import { DatePicker } from '@mui/lab';
import { Autocomplete, FormControl, Grid, IconButton, InputAdornment, TextField } from '@mui/material';
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
  return true;
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
  const [loading, setLoading] = useState(false);
  const [dogs, setDogs] = useLocalStorage('dogs', '');
  const [regNo, setRegNo] = useState<string>('');
  const [disabled, setDisabled] = useState(false);
  const allowRefresh = shouldAllowRefresh(reg.dog);
  const loadDog = async (value?: string, refresh?: boolean) => {
    if (!value) {
      value = regNo;
    }
    value = value.toUpperCase();
    if (value !== '' && (reg.dog.regNo !== value || refresh)) {
      setLoading(true);
      const lookup = await getDog(value, refresh);
      setLoading(false);
      const storedDogs = dogs?.split(',') || [];
      if (lookup && lookup.regNo) {
        storedDogs.push(lookup.regNo);
        setDogs(unique(storedDogs).filter(v => v !== '').join(','));
        setDisabled(true);
        setRegNo(lookup.regNo);
        onChange({ dog: { ...reg.dog, ...lookup } });
      } else {
        setDisabled(false);
        if (storedDogs.includes(value)) {
          setDogs(storedDogs.filter(v => v !== value).join(','));
        }
        onChange({ dog: { ...reg.dog, regNo: value } });
      }
    }
  };
  return (
    <CollapsibleSection title={t('registration.dog')} loading={loading} error={error} helperText={helperText}>
      <Grid container spacing={1}>
        <Grid item sx={{ minWidth: 220 }}>
          <Autocomplete
            id="txtReknro"
            freeSolo
            renderInput={(props) => <TextField {...props}
              error={!reg.dog.regNo}
              label={t('dog.regNo')}
              InputProps={{
                ...props.InputProps,
                endAdornment: <>{allowRefresh ? <InputAdornment position="end">
                  <IconButton size="small" onClick={() => loadDog(undefined, true)}><RefreshOutlined fontSize="small" /></IconButton>
                </InputAdornment> : ''}{props.InputProps.endAdornment}</>
              }} />}
            value={reg.dog.regNo}
            onChange={(e, value) => { setRegNo(value || ''); loadDog(value || ''); }}
            onInputChange={(e, value) => setRegNo(value)}
            options={dogs?.split(',') || []}
            onBlur={() => loadDog()} />
        </Grid>
        <Grid item>
          <TextField disabled={disabled} fullWidth label={t('dog.rfid')} value={reg.dog.rfid || ''} error={!reg.dog.rfid} onChange={(e) => onChange({ dog: { ...reg.dog, rfid: e.target.value } })} />
        </Grid>
        <Grid item sx={{ width: 300 }}>
          <AutocompleteSingle
            disableClearable
            disabled={disabled}
            getOptionLabel={(o) => t(`breed.${o}`)}
            label={t('dog.breed')}
            onChange={(e, value) => onChange({ dog: { ...reg.dog, breedCode: value || undefined } })}
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
            onChange={(e, value) => onChange({ dog: { ...reg.dog, gender: value } })}
            options={['F', 'M'] as DogGender[]}
            getOptionLabel={o => t(`dog.gender_choises.${o}`)}
          />
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField disabled={disabled} sx={{ width: 300 }} label={t('dog.titles')} value={reg.dog.titles || ''} onChange={(e) => onChange({ dog: { ...reg.dog, titles: e.target.value } })}/>
          </Grid>
          <Grid item>
            <TextField disabled={disabled} sx={{ width: 300 }} label={t('dog.name')} value={reg.dog.name || ''} error={!reg.dog.name} onChange={(e) => onChange({ dog: { ...reg.dog, name: e.target.value } })} />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField id="sire_titles" sx={{ width: 300 }} label={t('dog.sire.titles')} value={reg.dog.sire?.titles || ''} onChange={(e) => onChange({ dog: { ...reg.dog, sire: { ...reg.dog.sire, titles: e.target.value } } })} />
          </Grid>
          <Grid item>
            <TextField id="sire_name" sx={{ width: 300 }} label={t('dog.sire.name')} error={!reg.dog.sire?.name} value={reg.dog.sire?.name || ''} onChange={(e) => onChange({ dog: { ...reg.dog, sire: { ...reg.dog.sire, name: e.target.value } } }) } />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField id="dam_titles" sx={{ width: 300 }} label={t('dog.dam.titles')} value={reg.dog.dam?.titles || ''} onChange={(e) => onChange({ dog: { ...reg.dog, dam: { ...reg.dog.dam, titles: e.target.value } } })} />
          </Grid>
          <Grid item>
            <TextField id="dam_name" sx={{ width: 300 }} label={t('dog.dam.name')} value={reg.dog.dam?.name || ''} error={!reg.dog.dam?.name} onChange={(e) => onChange({ dog: { ...reg.dog, dam: { ...reg.dog.dam, name: e.target.value } } }) } />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}
