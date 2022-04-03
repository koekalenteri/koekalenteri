import { Grid } from '@mui/material';
import { eachDayOfInterval, format } from 'date-fns';
import { ConfirmedEventEx, Registration, RegistrationDate, ReserveChoise } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { AutocompleteMulti, AutocompleteSingle, CollapsibleSection } from '../..';
import { unique, uniqueDate } from '../../../utils';

function getClassDates(event: ConfirmedEventEx, classDate: string|undefined, regClass: string|undefined) {
  const classes = event.classes.filter(c => typeof c !== 'string' && (regClass === '' || c.class === regClass));

  const dates = classes.length
    ? classes.map(c => c.date || event.startDate)
    : eachDayOfInterval({ start: event.startDate, end: event.endDate });
  if (classDate) {
    return dates.filter(d => format(d, 'dd.MM') === classDate);
  }
  return uniqueDate(dates);
}

type EntryInfoProps = {
  reg: Registration
  event: ConfirmedEventEx
  classDate?: string
  error?: boolean
  helperText?: string
  errorStates: { [Property in keyof Registration]?: boolean }
  helperTexts: { [Property in keyof Registration]?: string }
  onChange: (props: Partial<Registration>) => void
}

export function EntryInfo({ reg, event, classDate, errorStates, helperTexts, onChange }: EntryInfoProps) {
  const { t } = useTranslation();
  const classDates: RegistrationDate[] = getClassDates(event, classDate, reg.class).flatMap((date) => [{ date, time: 'ap' }, { date, time: 'ip' }]);
  const error = errorStates.class || errorStates.dates || errorStates.reserve;
  const datesText = reg.dates.map(o => t('weekday', { date: o.date }) + (o.time === 'ap' ? ' (aamu)' : ' (ilta)')).join(' / ');
  const reserveText = reg.reserve ? t(`registration.reserveChoises.${reg.reserve}`) : '';
  const infoText = `${reg.class || reg.eventType}, ${datesText}, ${reserveText}`;
  const helperText = error ? t('validation.registration.required', { field: 'classesDetails' }) : infoText;

  return (
    <CollapsibleSection
      title={t('registration.class')}
      border={false}
      error={error}
      helperText={helperText}
    >
      <Grid container spacing={1}>
        <Grid item sx={{ minWidth: 100, display: event.classes.length === 0 ? 'none' : 'block' }}>
          <AutocompleteSingle
            disableClearable
            error={errorStates.class}
            helperText={helperTexts.class}
            label={t("registration.class")}
            onChange={(_e, value) => { onChange({ class: value || '' }); }}
            options={unique(event.classes.map(c => c.class))}
            value={reg.class}
          />
        </Grid>
        <Grid item>
          <AutocompleteMulti
            error={errorStates.dates}
            helperText={t("registration.datesInfo")}
            label={t("registration.dates")}
            onChange={(_e, value) => onChange({dates: value})}
            isOptionEqualToValue={(o, v) => o.date.valueOf() === v.date.valueOf() && o.time === v.time}
            getOptionLabel={o => t('weekday', { date: o.date }) + (o.time === 'ap' ? ' (aamu)' : ' (ilta)')}
            options={classDates}
            value={reg.dates}
          />
        </Grid>
        <Grid item sx={{ width: 280 }}>
          <AutocompleteSingle
            disableClearable
            error={errorStates.reserve}
            helperText={helperTexts.reserve}
            label={t('registration.reserve')}
            onChange={(_e, value) => onChange({ reserve: value || undefined })}
            getOptionLabel={o => o !== '' ? t(`registration.reserveChoises.${o}`) : ''}
            options={['ANY', 'DAY', 'WEEK', 'NO'] as ReserveChoise[]}
            value={reg.reserve}
          />
        </Grid>
      </Grid>
    </CollapsibleSection>
  );
}
