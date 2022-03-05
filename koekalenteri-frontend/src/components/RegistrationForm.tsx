import { RefreshOutlined } from '@mui/icons-material';
import { DatePicker } from '@mui/lab';
import { Autocomplete, Box, Checkbox, FormControl, FormControlLabel, Grid, IconButton, InputAdornment, InputLabel, Link, MenuItem, Select, SelectChangeEvent, TextField } from '@mui/material';
import { differenceInMinutes, eachDayOfInterval, subMonths, subYears } from 'date-fns';
import { ConfirmedEventEx, Dog, DogGender, Registration, TestResult } from 'koekalenteri-shared/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AutocompleteMulti, AutocompleteSingle, CollapsibleSection } from '.';
import { getDog } from '../api/dog';
import { useLocalStorage } from '../stores';
import { unique } from '../utils';

// TODO, these should be configurable
type EventRequirement = {
  age?: number,
  results?: EventResultRquirements | Array<EventResultRquirements>
};
type EventClassRequirement = {
  ALO?: EventRequirement
  AVO?: EventRequirement
  VOI?: EventRequirement
}
type EventResultRquirements = Array<Partial<TestResult> & { count: number }>;

const REQUIREMENTS: { [key: string]: EventRequirement | EventClassRequirement } = {
  NOU: {
    age: 9
  },
  'NOME-B': {
    ALO: {
      results: [{ type: 'NOU', result: 'NOU1', count: 1 }]
    },
    AVO: {
      results: [{ type: 'NOME-B', result: 'ALO1', count: 2 }]
    },
    VOI: {
      results: [{ type: 'NOME-B', result: 'AVO1', count: 2 }]
    }
  },
  NOWT: {
    ALO: {
      results: [{ type: 'NOU', result: 'NOU1', count: 1 }]
    },
    AVO: {
      results: [{ type: 'NOWT', result: 'ALO1', count: 1 }]
    },
    VOI: {
      results: [{ type: 'NOWT', result: 'AVO1', count: 1 }]
    }
  },
  'NOME-A': {
    results: [
      [{ type: 'NOME-B', result: 'AVO1', count: 2 }],
      [{ type: 'NOWT', result: 'AVO1', count: 2 }]
    ]
  },
  NKM: {
    results: [
      [{ type: 'NOME-B', result: 'VOI1', count: 2 }],
      [{ type: 'NOWT', cert: true, count: 2 }]
    ]
  }
};

const objectContains = (obj: Record<string, any>, req: Record<string, any>) => {
  for (const key of Object.keys(req)) {
    if (obj[key] !== req[key]) {
      return false;
    }
  }
  return true;
}

export function RegistrationForm({ event, className, classDate }: { event: ConfirmedEventEx, className?: string, classDate?: string }) {
  const requirements = REQUIREMENTS[event.eventType];
  const [local, setLocal] = useState<Registration>({
    eventId: event.id,
    class: className || '',
    dates: [],
    dog: {
      regNo: '',
      rfid: '',
      breedCode: '',
      name: '',
      dob: ''
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
  const onChange = (props: Partial<Registration>) => {
    console.log('Changes: ' + JSON.stringify(props));
    if (props.class || props.dog) {
      const c = props.class || local.class;
      const dog = props.dog || local.dog;
      const req = ((requirements as EventClassRequirement)[c as 'ALO' | 'AVO' | 'VOI'] || requirements) as EventRequirement;
      const qr = [];
      if (dog.results) {
        for (const res of (req.results || [])) {
          if (Array.isArray(res)) {
            console.log('array');
          } else {
            const { count: n, ...resultProps } = res;
            qr.push(...dog.results.filter(dr => objectContains(dr, resultProps)).slice(0, n));
          }
        }
      }
      props.qualifyingResults = qr;
      console.log(qr);
    }
    const newState = { ...local, ...props };
    //const isValid = validateEvent(newState);
    setLocal(newState);
    /*
    setChanges(true);
    if (valid !== isValid) {
      setValid(isValid);
    }*/
  }

  return (
    <Box sx={{ backgroundColor: 'background.form', pb: 0.5, '& .MuiInputBase-root': { backgroundColor: 'background.default' } }}>
      <EventEntryInfo reg={local} event={event} className={className} classDate={classDate} onChange={onChange} />
      <DogInfo reg={local} eventDate={event.startDate} minDogAgeMonths={9} onChange={onChange} />
      <BreederInfo />
      <OwnerInfo />
      <HandlerInfo />
      <QualifyingResultsInfo reg={local} onChange={onChange} />
      <AdditionalInfo />
      <FormControlLabel control={<Checkbox required />} label={
        <>
          <span>Olen lukenut</span>&nbsp;
          <Link target="_blank" rel="noopener" href="https://yttmk.yhdistysavain.fi/noutajien-metsastyskokeet/metsastyskoesaannot/kokeen-ja-tai-kilpailun-ilmoitta/">ilmoittautumisen ehdot</Link>
          &nbsp;<span>ja hyväksyn ne</span>
        </>
      } />
      <FormControlLabel control={<Checkbox required />} label="Hyväksyn, että kokeen järjestämisen vastuuhenkilöt voivat käsitellä ilmoittamiani henkilötietoja ja julkaista niitä tarpeen mukaan kokeen osallistuja- ja tulosluettelossa koepaikalla ja kokeeseen liittyvissä julkaisuissa internetissä tai muissa yhdistyksen medioissa." />
    </Box>
  );
}

function getClassDates(event: ConfirmedEventEx, eventClass: string) {
  const classes = event.classes.filter(c => typeof c !== 'string' && (eventClass === '' || c.class === eventClass));

  return classes.length
    ? classes.map(c => c.date || event.startDate)
    : eachDayOfInterval({ start: event.startDate, end: event.endDate });
}

function EventEntryInfo({reg, event, className, classDate, onChange}: {reg: Registration, event: ConfirmedEventEx, className?: string, classDate?: string, onChange: (props: Partial<Registration>) => void;}) {
  const {t} = useTranslation();
  const [reserve, setReserve] = useState('1');
  const classDates = unique(getClassDates(event, reg.class).map(date => t('weekday', { date }))).flatMap(wd => [wd + ' (aamu)', wd + ' (ilta)']);
  const [eventTime, setEventTime] = useState(classDate ? classDates : []);
  return (
    <CollapsibleSection title="Koeluokka">
      <Grid container spacing={1}>
        <Grid item sx={{minWidth: 150}}>
          <AutocompleteSingle
            disableClearable
            label={t("eventClass")}
            onChange={(e, value) => { onChange({ class: value || '' }) }}
            options={unique(event.classes.map(c => c.class))}
            value={reg.class}
          />
        </Grid>
        <Grid item>
          <AutocompleteMulti
            helperText="Valitse sinulle sopivat ajankohdat kokeeseen osallistumiselle."
            label={t("eventTime")}
            onChange={(e, value) => setEventTime(value)}
            options={classDates}
            value={eventTime}
          />
        </Grid>
        <Grid item sx={{width: 300}}>
          <FormControl fullWidth>
            <InputLabel id="reserve-label">Varasija</InputLabel>
            <Select
              labelId="reserve-label"
              id="reserve-select"
              label="Varasija"
              value={reserve}
              onChange={(event) => setReserve(event.target.value)}
            >
              <MenuItem value="1">Osallistun varasijalta</MenuItem>
              <MenuItem value="2">Osallistun varasijalta, päivän varoitusajalla</MenuItem>
              <MenuItem value="3">Osallistun varasijalta, viikon varoitusajalla</MenuItem>
              <MenuItem value="4">En osallistu varasijalta</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}

type BreedCode = '110' | '111' | '121' | '122' | '263' | '312';

function shouldAllowRefresh(dog?: Partial<Dog>) {
  if (!dog || !dog.regNo) {
    return false;
  }
  if (dog.refreshDate && differenceInMinutes(new Date(), dog.refreshDate as Date) <= 5) {
    return false;
  }
  return true;
}

function DogInfo({ reg, eventDate, minDogAgeMonths, onChange }: { reg: Registration, eventDate: Date, minDogAgeMonths: number, onChange: (props: Partial<Registration>) => void; }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [dogs, setDogs] = useLocalStorage('dogs', '');
  const [regNo, setRegNo] = useState<string>('');
  const [dog, setDog] = useState<Partial<Dog>>({});
  const allowRefresh = shouldAllowRefresh(dog);
  const genderChanged = (event: SelectChangeEvent) => { setDog({ ...dog, gender: event.target.value as DogGender }); }
  const loadDog = async(value?: string, refresh?: boolean) => {
    if (!value) {
      value = regNo;
    }
    value = value.toUpperCase();
    if (value !== '' && (reg.dog.regNo !== value || refresh)) {
      setLoading(true);
      const lookup = await getDog(value, refresh);
      setDog(lookup);
      setLoading(false);
      if (lookup && lookup.regNo) {
        const newDogs = (dogs?.split(',') || []);
        newDogs.push(value);
        setDogs(unique(newDogs).filter(v => v !== '').join(','));
        onChange({ dog: lookup });
      } else {
        onChange({ dog: { ...reg.dog, regNo: value } });
      }
    }
  }
  return (
    <CollapsibleSection title="Koiran tiedot" loading={loading}>
      <Grid container spacing={1}>
        <Grid item sx={{ minWidth: 220 }}>
          <Autocomplete
            freeSolo
            renderInput={(props) =>
              <TextField {...props}
                label="Koiran rekisterinumero"
                InputProps={{
                  ...props.InputProps,
                  endAdornment: <>{allowRefresh ? <InputAdornment position="end">
                    <IconButton size="small" onClick={() => loadDog(undefined, true)}><RefreshOutlined fontSize="small" /></IconButton>
                  </InputAdornment> : ''}{props.InputProps.endAdornment}</>
                }}
              />}
            value={reg.dog.regNo}
            onChange={(e, value) => { setRegNo(value || ''); loadDog(value || ''); }}
            onInputChange={(e, value) => setRegNo(value)}
            options={dogs?.split(',') || []}
            onBlur={() => loadDog()}
          />
        </Grid>
        <Grid item>
          <TextField fullWidth label="Tunnistusmerkintä" value={dog.rfid || ''} />
        </Grid>
        <Grid item sx={{ width: 300 }}>
          <Autocomplete
            sx={{display: 'flex'}}
            fullWidth
            renderInput={(props) => <TextField {...props} label="Rotu" />}
            value={dog.breedCode || ''}
            onChange={(e, value) => setDog({ ...dog, breedCode: value || '' })}
            options={['122', '111', '121', '312', '110', '263']}
            getOptionLabel={(v) => v ? t(`breed_${v as BreedCode}`) : ''}
          />
        </Grid>
        <Grid item sm={12} lg={'auto'}>
          <FormControl sx={{width: 146, mr: 0.5}}>
            <DatePicker
              label="Syntymäaika"
              value={dog.dob || ''}
              mask={t('datemask')}
              inputFormat={t('dateformat')}
              minDate={subYears(new Date(), 15)}
              maxDate={subMonths(eventDate, minDogAgeMonths)}
              defaultCalendarMonth={subYears(new Date(), 2)}
              openTo={'year'}
              views={['year', 'month', 'day']}
              onChange={(value) => setDog({...dog, dob: value || ''})}
              renderInput={(params) => <TextField {...params} />}
            />
          </FormControl>
          <FormControl sx={{width: 146, ml: 0.5}}>
            <InputLabel id="gender-label">Sukupuoli</InputLabel>
            <Select
              labelId="gender-label"
              id="gender-select"
              value={dog.gender || ''}
              label="Sukupuoli"
              onChange={genderChanged}
            >
              <MenuItem value="F">Narttu</MenuItem>
              <MenuItem value="M">Uros</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField sx={{width: 300}} label="Tittelit" value={dog.titles || ''} />
          </Grid>
          <Grid item>
            <TextField sx={{width: 300}} label="Nimi" value={dog.name || ''} onChange={(e) => setDog({...dog, name: e.target.value})} />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField sx={{width: 300}} label="Isän tittelit" />
          </Grid>
          <Grid item>
            <TextField sx={{width: 300}} label="Isän nimi" />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField sx={{width: 300}} label="Emän tittelit" />
          </Grid>
          <Grid item>
            <TextField sx={{width: 300}} label="Emän nimi" />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}

function BreederInfo() {
  return (
    <CollapsibleSection title="Kasvattajan tiedot">
      <Grid item container spacing={1}>
        <Grid item>
          <TextField name="name" sx={{width: 300}} label="Nimi" />
        </Grid>
        <Grid item>
          <TextField name="city" sx={{width: 300}} label="Postitoimipaikka" />
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}

function OwnerInfo() {
  return (
    <CollapsibleSection title="Omistajan tiedot">
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField name="name" sx={{width: 300}} label="Nimi" />
          </Grid>
          <Grid item>
            <TextField name="city" sx={{width: 300}} label="Kotikunta" />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField name="email" sx={{width: 300}} label="Sähköposti" />
          </Grid>
          <Grid item>
            <TextField name="phone" sx={{width: 300}} label="Puhelin" />
          </Grid>
        </Grid>
      </Grid>
      <FormControlLabel control={<Checkbox />} label="Omistaja on järjestävän yhdistyksen jäsen" />
    </CollapsibleSection>
  );
}

function HandlerInfo() {
  return (
    <CollapsibleSection title="Ohjaajan tiedot">
      <FormControlLabel control={<Checkbox />} label="Omistaja ohjaa" />
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField name="name" sx={{width: 300}} label="Nimi" />
          </Grid>
          <Grid item>
            <TextField name="city" sx={{width: 300}} label="Kotikunta" />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item>
            <TextField name="email" sx={{width: 300}} label="Sähköposti" />
          </Grid>
          <Grid item>
            <TextField name="phone" sx={{width: 300}} label="Puhelin" />
          </Grid>
        </Grid>
      </Grid>
      <FormControlLabel control={<Checkbox />} label="Ohjaaja on järjestävän yhdistyksen jäsen" />
    </CollapsibleSection>
  );
}

function QualifyingResultsInfo({ reg, onChange }: { reg: Registration, onChange: (props: Partial<Registration>) => void; }) {
  const { t } = useTranslation();
  const { t: te } = useTranslation('event');

  return (
    <CollapsibleSection title={t("qualifyingResults")}>
      <Grid item container spacing={1}>
        {reg.qualifyingResults.map(result =>
          <Grid key={result.date.toString()} item container spacing={1}>
            <Grid item>
              <FormControl sx={{ width: 150 }}>
                <InputLabel id="type-label">{t("eventType")}</InputLabel>
                <Select
                  labelId="type-label"
                  label={t("eventType")}
                  value={result.type}
                >
                  <MenuItem value="NOU">NOU</MenuItem>
                  <MenuItem value="NOME-B">NOME-B</MenuItem>
                  <MenuItem value="NOME-A">NOME-A</MenuItem>
                  <MenuItem value="NOWT">NOWT</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item>
              <FormControl sx={{ width: 150 }}>
                <InputLabel id="result-label">{t("result")}</InputLabel>
                <Select
                  labelId="result-label"
                  label={t("result")}
                  value={result.cert ? 'CERT' : result.result}
                >
                  <MenuItem value="NOU1">NOU1</MenuItem>
                  <MenuItem value="ALO1">ALO1</MenuItem>
                  <MenuItem value="AVO1">AVO1</MenuItem>
                  <MenuItem value="VOI1">VOI1</MenuItem>
                  <MenuItem value="CERT">VOI1 (CERT)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item>
              <FormControl sx={{ width: 150 }}>
                <DatePicker
                  label={t("date")}
                  value={result.date}
                  mask={t('datemask')}
                  inputFormat={t('dateformat')}
                  minDate={subYears(new Date(), 15)}
                  maxDate={new Date()}
                  onChange={(value) => { if (value) { result.date = value } }}
                  renderInput={(params) => <TextField {...params} />}
                />
              </FormControl>
            </Grid>
            <Grid item>
              <TextField sx={{ width: 300 }} label={te("location")} value={result.location} />
            </Grid>
            <Grid item>
              <TextField sx={{ width: 300 }} label={t("judge")} value={result.judge} />
            </Grid>
          </Grid>
        )}
      </Grid>
    </CollapsibleSection>
  );
}

function AdditionalInfo() {
  return (
    <CollapsibleSection title="Lisätiedot">
      <TextField multiline rows={4} sx={{width: '100%'}}></TextField>
    </CollapsibleSection>
  );
}


