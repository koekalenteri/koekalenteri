import { DarkMode, LightMode } from '@mui/icons-material';
import { DatePicker } from '@mui/lab';
import { Box, Checkbox, Chip, FormControl, FormControlLabel, FormHelperText, Grid, InputLabel, Link, MenuItem, Select, SelectChangeEvent, TextField } from '@mui/material';
import { makeStyles } from '@mui/styles';
import { eachDayOfInterval, format, subMonths, subYears } from 'date-fns';
import type { EventEx, EventClass } from 'koekalenteri-shared/model';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection, MultiSelect, stringsToMultiSelectOptions } from '.';

const useStyles = makeStyles(theme => ({
  root: {
    backgroundColor: theme.palette.background.form,
    '& .MuiInputBase-root': {
      backgroundColor: theme.palette.background.default
    }
  }
}));

export function RegistrationForm({ event, className, classDate }: { event: EventEx, className?: string, classDate?: string }) {
  const classes = useStyles();
  return (
    <Box className={classes.root} sx={{pb: 0.5}}>
      <EventEntryInfo event={event} className={className} classDate={classDate} />
      <DogInfo eventDate={event.startDate} minDogAgeMonths={9} />
      <BreederInfo />
      <OwnerInfo />
      <HandlerInfo />
      <QualifyingResultsInfo />
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

function unique(arr: string[]): string[] {
  return arr.filter((c, i, a) => a.indexOf(c) === i);
}

function classDates(event: EventEx, eventClass: string, fmt: string): string[] {
  const classes = event.classes.filter(cls => typeof cls !== 'string' && (eventClass === '' || cls.class === eventClass)) as EventClass[];
  const dates = classes.length ? classes.map(c => c.date || event.startDate) : eachDayOfInterval({ start: event.startDate, end: event.endDate });
  const strings = unique(dates.map(date => format(date, fmt)));
  const result = [];
  for (const s of strings) {
    result.push(s + ' (aamupäivä)');
    result.push(s + ' (iltapäivä)');
  }
  return result;
}

function eventClasses(event: EventEx): string[] {
  return unique(event.classes.map(c => c.class));
}

function renderDates(selected: string[]) {
  const map: Record<string, Record<string, boolean>> = {};
  for (const s of selected) {
    const [date, time] = s.split(' ');
    const set = map[date] || (map[date] = {});
    set[time] = true;
  }
  const dates = Object.keys(map);
  return (
    dates.map((date) =>
      <Box key={date} sx={{ position: 'relative', display: 'inline-block', pr: 2 }}>
        <Chip size="small" label={date} variant="outlined" color="success" sx={{height: '21px'}}/>
        {map[date]['(aamupäivä)'] ? <LightMode sx={{ fontSize: 'x-small', position: 'absolute', right: 6, top: 0 }} color="info" /> : ''}
        {map[date]['(iltapäivä)'] ? <DarkMode sx={{ fontSize: 'x-small', position: 'absolute', right: 6, bottom: 0 }} color="info" /> : ''}
      </Box>
    )
  );
}

function EventEntryInfo({event, className, classDate}: {event: EventEx, className?: string, classDate?: string}) {
  const {t} = useTranslation();
  const [reserve, setReserve] = useState('1');
  const [eventClass, setEventClass] = useState(className || '');
  const [eventTime, setEventTime] = useState(classDate ? [classDate + ' (aamupäivä)', classDate + ' (iltapäivä)'] : []);
  return (
    <CollapsibleSection title="Koeluokka">
      <Grid container spacing={1}>
        <Grid item>
          <FormControl sx={{width: 300}}>
            <InputLabel id="class-label">{t("eventClass")}</InputLabel>
            <Select
              labelId="class-label"
              id="class-select"
              value={eventClass}
              label={t("eventClass")}
              onChange={(event) => setEventClass(event.target.value)}
            >
              {eventClasses(event).map(c => <MenuItem key={'class' + c} value={c}>{c}</MenuItem>)}
            </Select>
          </FormControl>
        </Grid>
        <Grid item>
          <FormControl sx={{width: 300}}>
            <InputLabel id="date-label">{t("eventTime")}</InputLabel>
            <MultiSelect
              labelId="class-label"
              id="class-select"
              value={eventTime}
              label={t("eventTime")}
              onChange={(value) => setEventTime(value)}
              options={stringsToMultiSelectOptions(classDates(event, eventClass, t('dateformatS')))}
              renderValue={renderDates}
            />
            <FormHelperText>Valitse sinulle sopivat ajankohdat kokeeseen osallistumiselle.</FormHelperText>
          </FormControl>
        </Grid>
        <Grid item>
          <FormControl sx={{width: 300}}>
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
              <MenuItem value="3">Osallistun varasijalta, viikkon varoitusajalla</MenuItem>
              <MenuItem value="4">En osallistu varasijalta</MenuItem>
            </Select>
          </FormControl>
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}

function DogInfo({ eventDate, minDogAgeMonths }: { eventDate: Date, minDogAgeMonths: number }) {
  const {t} = useTranslation();
  const [dob, setDob] = useState<Date | null>(null);
  const [gender, setGender] = useState("");
  const [breed, setBreed] = useState("");
  const genderChanged = (event: SelectChangeEvent) => { setGender(event.target.value); }
  const breedChanged = (event: SelectChangeEvent) => { setBreed(event.target.value); }
  return (
    <CollapsibleSection title="Koiran tiedot">
      <Grid container spacing={1}>
        <Grid item>
          <TextField sx={{width: 146, mr: 0.5}} label="Koiran rekisterinumero" />
          <TextField sx={{width: 146, ml: 0.5}} label="Tunnistusmerkintä" />
        </Grid>
        <Grid item>
          <FormControl sx={{width: 300}}>
            <InputLabel id="breed-label">Rotu</InputLabel>
            <Select
              labelId="breed-label"
              id="breed-select"
              value={breed}
              label="Rotu"
              onChange={breedChanged}
            >
              <MenuItem value="LR">Labradorinnoutaja</MenuItem>
              <MenuItem value="GR">Kultainennoutaja</MenuItem>
              <MenuItem value="FC">Sileäkarvainen noutaja</MenuItem>
              <MenuItem value="NS">Novascotiannoutaja</MenuItem>
              <MenuItem value="CC">Kiharakarvainen noutaja</MenuItem>
              <MenuItem value="CB">Chesapeakelahdennoutaja</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item sm={12} lg={'auto'}>
          <FormControl sx={{width: 146, mr: 0.5}}>
            <DatePicker
              label="Syntymäaika"
              value={dob}
              mask={t('datemask')}
              inputFormat={t('dateformat')}
              minDate={subYears(new Date(), 15)}
              maxDate={subMonths(eventDate, minDogAgeMonths)}
              defaultCalendarMonth={subYears(new Date(), 2)}
              openTo={'year'}
              views={['year', 'month', 'day']}
              onChange={setDob}
              renderInput={(params) => <TextField {...params} />}
            />
          </FormControl>
          <FormControl sx={{width: 146, ml: 0.5}}>
            <InputLabel id="gender-label">Sukupuoli</InputLabel>
            <Select
              labelId="gender-label"
              id="gender-select"
              value={gender}
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
            <TextField sx={{width: 300}} label="Tittelit" />
          </Grid>
          <Grid item>
            <TextField sx={{width: 300}} label="Nimi" />
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

function QualifyingResultsInfo() {
  const { t } = useTranslation();
  const [date, setDate] = useState<Date | null>(null);

  return (
    <CollapsibleSection title={t("qualifyingResults")}>
      <Grid item container spacing={1}>
        <Grid item>
          <FormControl sx={{ width: 150 }}>
            <InputLabel id="type-label">{t("eventType")}</InputLabel>
            <Select
              labelId="type-label"
              label={t("eventType")}
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
            >
              <MenuItem value="1">1</MenuItem>
              <MenuItem value="2">2</MenuItem>
              <MenuItem value="3">3</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item>
          <FormControl sx={{ width: 150 }}>
            <DatePicker
              label={t("date")}
              value={date}
              mask={t('datemask')}
              inputFormat={t('dateformat')}
              minDate={subYears(new Date(), 15)}
              maxDate={new Date()}
              onChange={setDate}
              renderInput={(params) => <TextField {...params} />}
            />
          </FormControl>
        </Grid>
        <Grid item>
          <TextField sx={{width: 300}} label={t("location")} />
        </Grid>
        <Grid item>
          <TextField sx={{width: 300}} label={t("judge")} />
        </Grid>
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


