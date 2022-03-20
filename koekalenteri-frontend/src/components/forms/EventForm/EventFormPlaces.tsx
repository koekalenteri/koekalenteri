import { FormHelperText, Table, TableBody, TableCell, TableHead, TableRow, TextField, TextFieldProps } from '@mui/material';
import { eachDayOfInterval, isSameDay } from 'date-fns';
import { EventClass } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { unique } from '../../../utils';
import { compareEventClass } from './EventClasses';
import { EntrySectionProps } from './3.EntrySection';

export function EventFormPlaces({ event, helperTexts, onChange }: EntrySectionProps) {
  const { t } = useTranslation();
  const days = eachDayOfInterval({
    start: event.startDate,
    end: event.endDate
  });
  const uniqueClasses = unique(event.classes.map(c => c.class));
  const classesByDays = days.map(day => ({ day, classes: event.classes.filter(c => isSameDay(c.date || event.startDate, day)) }));
  const handleChange = (c: EventClass) => (e: { target: { value: any; }; }) => {
    const newClasses = [...event.classes];
    const cls = newClasses.find(ec => compareEventClass(ec, c) === 0);
    if (cls) {
      cls.places = validValue(e.target.value);
    }
    const total = newClasses.reduce((prev, cur) => prev + (cur?.places || 0), 0);
    onChange({ classes: newClasses, places: total ? total : event.places });
  };

  return (
    <>
      <Table size="small" sx={{ '& .MuiTextField-root': { m: 0, width: '10ch' } }}>
        <TableHead>
          <TableRow>
            <TableCell>{t('date')}</TableCell>
            {uniqueClasses.map(c => <TableCell key={`head${c}`} align='center'>{c}</TableCell>)}
            <TableCell align="center">Yhteensä</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {classesByDays.map(({ day, classes }) => {
            let dayTotal = 0;
            return (
              <TableRow key={day.toISOString()}>
                <TableCell component="th" scope="row">{t('dateshort', { date: day })}</TableCell>
                {uniqueClasses.map(c => {
                  const cls = classes.find(cl => cl.class === c);
                  dayTotal += cls?.places || 0;
                  return <TableCell key={c} align="center">{cls ? <PlacesInput value={cls.places} onChange={handleChange(cls)} /> : ''}</TableCell>;
                })}
                <TableCell align="center"><PlacesDisplay value={dayTotal} /></TableCell>
              </TableRow>
            );
          })}
          <TableRow>
            <TableCell component="th" scope="row">Yhteensä</TableCell>
            {uniqueClasses.map(c => <TableCell align="center"><PlacesDisplay value={event.classes.filter(ec => ec.class === c).reduce((prev, cur) => prev + (cur?.places || 0), 0)} /></TableCell>)}
            <TableCell align="center">
              <PlacesInput
                value={event.places || ''}
                onChange={(e) => {
                  let value = +e.target.value;
                  if (value < 0) {
                    value = 0;
                  }
                  if (value > 999) {
                    value = 999;
                  }
                  const newClasses = [...event.classes];
                  for (const c of newClasses) {
                    c.places = 0;
                  }
                  onChange({ classes: newClasses, places: value });
                }} />
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <FormHelperText error>{helperTexts.places}</FormHelperText>
    </>

  );
}

const validValue = (s: string) => {
  let value = +s;
  if (value < 0) {
    value = 0;
  }
  if (value > 200) {
    value = 200;
  }
  return value;
};

function PlacesInput(props: JSX.IntrinsicAttributes & TextFieldProps) {
  return (
    <TextField
      {...props}
      value={props.value === 0 ? '' : props.value}
      type="number"
      size="small"
      InputProps={{ inputProps: { min: 0, max: 999, style: {textAlign: 'right', padding: 4} } }}
    >
    </TextField>);
}

function PlacesDisplay({ value }: { value: number }) {
  return (<>{value === 0 ? '' : value}</>);
}
