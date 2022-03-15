import { Grid } from '@mui/material';
import { eachDayOfInterval, format } from 'date-fns';
import { ConfirmedEventEx, Registration, RegistrationDate, ReserveChoise } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { AutocompleteMulti, AutocompleteSingle, CollapsibleSection } from '../..';
import { unique } from '../../../utils';

function getClassDates(event: ConfirmedEventEx, classDate: string|undefined, eventClass: string) {
  const classes = event.classes.filter(c => typeof c !== 'string' && (eventClass === '' || c.class === eventClass));

  const dates = classes.length
    ? classes.map(c => c.date || event.startDate)
    : eachDayOfInterval({ start: event.startDate, end: event.endDate });
  if (classDate) {
    return dates.filter(d => format(d, 'dd.MM') === classDate);
  }
  return dates;
}

type EntryInfoProps = {
  reg: Registration
  event: ConfirmedEventEx
  classDate?: string
  errorStates: { [Property in keyof Registration]?: boolean }
  helperTexts: { [Property in keyof Registration]?: string }
  onChange: (props: Partial<Registration>) => void
}

export function EntryInfo({ reg, event, classDate, errorStates, helperTexts, onChange }: EntryInfoProps) {
  const { t } = useTranslation();
  const classDates: RegistrationDate[] = getClassDates(event, classDate, reg.class).flatMap((date) => [{ date, time: 'ap' }, { date, time: 'ip' }]);
  const error = errorStates.class || errorStates.dates || errorStates.reserve;

  return (
    <CollapsibleSection title="Koeluokka" error={error} helperText={error ? 'Tiedot ovat puutteelliset' : ''}>
      <Grid container spacing={1}>
        <Grid item sx={{ minWidth: 150 }}>
          <AutocompleteSingle
            disableClearable
            error={errorStates.class}
            helperText={helperTexts.class}
            label={t("registration.class")}
            onChange={(e, value) => { onChange({ class: value || '' }); }}
            options={unique(event.classes.map(c => c.class))}
            value={reg.class}
          />
        </Grid>
        <Grid item>
          <AutocompleteMulti
            error={errorStates.dates}
            helperText={t("registration.dates_info")}
            label={t("registration.dates")}
            onChange={(e, value) => onChange({dates: value})}
            isOptionEqualToValue={(o, v) => o.date === v.date && o.time === v.time}
            getOptionLabel={o => t('weekday', { date: o.date }) + (o.time === 'ap' ? ' (aamu)' : ' (ilta)')}
            options={classDates}
            value={reg.dates}
          />
        </Grid>
        <Grid item sx={{ width: 300 }}>
          <AutocompleteSingle
            disableClearable
            error={errorStates.reserve}
            helperText={helperTexts.reserve}
            label={t('registration.reserve')}
            onChange={(e, value) => onChange({ reserve: value || undefined })}
            getOptionLabel={o => o !== '' ? t(`registration.reserve_choises.${o}`) : ''}
            options={['ANY', 'DAY', 'WEEK', 'NO'] as ReserveChoise[]}
            value={reg.reserve}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}
