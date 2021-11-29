import { Table, TableBody, TableRow, TableCell } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { format } from 'date-fns';
import { EventClass, EventEx } from "koekalenteri-shared";
import { useTranslation } from 'react-i18next';
import { LinkButton } from './Buttons';

const useRowStyles = makeStyles({
  root: {
    '& *': {
      borderBottom: 'unset',
      padding: '2px 16px 2px 0'
    },
    '& th': {
      width: '1%',
      whiteSpace: 'nowrap',
      verticalAlign: 'top'
    },
    '& td': {
      whiteSpace: 'normal'
    }
  },
  classes: {
    '& th': {
      padding: '0 8px 0 0',
      verticalAlign: 'middle'
    }
  }
});

function entryDateColor(event: EventEx) {
  if (!event.isEntryOpen) {
    return 'text.primary';
  }
  return event.isEntryClosing ? 'warning.main' : 'success.main';
}

export function EventInfo({ event }: { event: EventEx }) {
  const classes = useRowStyles();
  const { t } = useTranslation();
  return (
    <>
      <Table size="small" aria-label="details" className={classes.root}>
        <TableBody>
          <TableRow key={event.id + 'date'}>
            <TableCell component="th" scope="row">{t('entryTime')}:</TableCell>
            <TableCell sx={{ color: entryDateColor(event) }}>
              <b>{t('daterange', { start: event.entryStartDate, end: event.entryEndDate })}</b>
              {event.isEntryOpen ? t('distanceLeft', { date: event.entryEndDate }) : ''}
            </TableCell>
          </TableRow>
          <TableRow key={event.id + 'organizer'}>
            <TableCell component="th" scope="row">{t('organizer')}:</TableCell>
            <TableCell>{event.organizer?.name}</TableCell>
          </TableRow>
          <TableRow key={event.id + 'eventType'}>
            <TableCell component="th" scope="row">{t('eventType')}:</TableCell>
            <TableCell>{event.eventType}</TableCell>
          </TableRow>
          {event.classes.length ? <EventClassRow key={event.id + 'classes'} event={event} /> : ''}
          <TableRow key={event.id + 'judge' + event.judges[0]}>
            <TableCell component="th" scope="row" rowSpan={event.judges.length}>{t('judges')}:</TableCell>
            <TableCell>{event.judges[0]}</TableCell>
          </TableRow>
          {event.judges.slice(1).map((judge) => (
            <TableRow key={event.id + 'judge' + judge}><TableCell>{judge}</TableCell></TableRow>
          ))}
          <TableRow key={event.id + 'official'}>
            <TableCell component="th" scope="row">{t('official')}:</TableCell>
            <TableCell>{event.official}</TableCell>
          </TableRow>
          <TableRow key={event.id + 'payment'}>
            <TableCell component="th" scope="row">{t('paymentDetails')}:</TableCell>
            <TableCell>{event.paymentDetails}</TableCell>
          </TableRow>
          <TableRow key={event.id + 'location'}>
            <TableCell component="th" scope="row">{t('location')}:</TableCell>
            <TableCell>{event.location}</TableCell>
          </TableRow>
          <TableRow key={event.id + 'description'}>
            <TableCell component="th" scope="row">{t('description')}:</TableCell>
            <TableCell>{event.description}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </>
  );
}

type EventProps = {
  event: EventEx
}

function EventClassRow({ event }: EventProps) {
  const { t } = useTranslation();
  return (
    <TableRow key={event.id + 'classes'}>
      <TableCell component="th" scope="row">{t('eventClasses')}:</TableCell>
      <TableCell><EventClassTable event={event} /></TableCell>
    </TableRow>
  );
}

const eventClassKey = (eventId: string, eventClass: string | EventClass) =>
  eventId + 'class' + (typeof eventClass === 'string' ? eventClass : eventClass.date + eventClass.class);

function EventClassTable({ event }: EventProps) {
  const classes = useRowStyles();
  return (
    <Table size="small" className={classes.classes}>
      <TableBody>
        {event.classes.map(eventClass =>
          <EventClassTableRow key={eventClassKey(event.id, eventClass)} event={event} eventClass={eventClass} />)}
      </TableBody>
    </Table>
  );
}

function EventClassTableRow({ event, eventClass }: { event: EventEx, eventClass: string | EventClass }) {
  const { t } = useTranslation();
  const isSimple = typeof eventClass === 'string';
  const classString = isSimple ? eventClass : eventClass.class;
  const classDate = format(isSimple ? event.startDate : eventClass.date, t('dateformatS'));
  return (
    <TableRow>
      {isSimple
        ? <SimpleEventClass eventClass={eventClass} />
        : <ComplexEventClass eventClass={eventClass} />
      }
      <TableCell component="th" scope="row">
        {event.isEntryOpen ? <LinkButton to={`/event/${event.eventType}/${event.id}/${classString}/${classDate}`} text={t('register')} /> : ''}
      </TableCell>
      <TableCell></TableCell>
    </TableRow>
  )
}

function SimpleEventClass({ eventClass }: {eventClass: string}) {
  return (
    <TableCell component="th" scope="row">{eventClass}</TableCell>
  );
}

function ComplexEventClass({ eventClass }: { eventClass: EventClass }) {
  const { t } = useTranslation();
  return (
    <>
      <TableCell component="th" scope="row">{t('dateshort', { date: eventClass.date })}</TableCell>
      <TableCell component="th" scope="row">{eventClass.class}</TableCell>
      <TableCell component="th" scope="row">{eventClass.judge?.name}</TableCell>
      <TableCell component="th" scope="row" align="right">{eventClass.entries}/{eventClass.places}</TableCell>
      <TableCell component="th" scope="row" align="right">{eventClass.members}</TableCell>
    </>
  );
}
