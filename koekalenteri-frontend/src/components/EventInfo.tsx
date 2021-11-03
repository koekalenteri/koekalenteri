import { Table, TableBody, TableRow, TableCell, Box } from '@mui/material';
import makeStyles from '@mui/styles/makeStyles';
import { Event, EventClass, EventEx } from "koekalenteri-shared";
import { useTranslation } from 'react-i18next';

const useRowStyles = makeStyles({
  root: {
    '& *': {
      borderBottom: 'unset',
      padding: 4
    },
    '& th': {
      width: '1%',
      whiteSpace: 'nowrap',
      verticalAlign: 'top'
    },
  },
});

function entryDateColor(event: EventEx) {
  if (!event.isEntryOpen) {
    return 'text.primary';
  }
  return event.isEntryClosing ? 'warning.main' : 'success.main';
}

export function EventInfo(props: { event: EventEx }) {
  const { event } = props;
  const classes = useRowStyles();
  const { t } = useTranslation();
  return (
    <Box margin={1}>
      <Table size="small" aria-label="details" className={classes.root}>
        <TableBody>
          <TableRow key={event.id + 'title'} >
            <TableCell component="th" scope="row" colSpan={2}>
              {t('daterange', { start: event.startDate, end: event.endDate }) +
                ' ' + event.location + (event.name ? ` (${event.name})` : '')}
            </TableCell>
          </TableRow>
          <TableRow key={event.id + 'organizer'}>
            <TableCell component="th" scope="row">{t('organizer')}:</TableCell>
            <TableCell>{event.organizer?.name}</TableCell>
          </TableRow>
          <TableRow key={event.id + 'date'}>
            <TableCell component="th" scope="row">{t('entryTime')}:</TableCell>
            <TableCell sx={{ color: entryDateColor(event) }}>
              {t('daterange', { start: event.entryStartDate, end: event.entryEndDate })}
            </TableCell>
          </TableRow>
          <TableRow key={event.id + 'eventType'}>
            <TableCell component="th" scope="row">{t('eventType')}:</TableCell>
            <TableCell>{event.eventType}</TableCell>
          </TableRow>
          {event.classes.length ? <EventClassRow event={event} /> : ''}
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
    </Box>
  );
}

type EventProps = {
  event: Event
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
  return (
    <Table size="small">
      <TableBody>
        {event.classes.map(eventClass =>
          <EventClassTableRow key={eventClassKey(event.id, eventClass)} eventClass={eventClass} />)}
      </TableBody>
    </Table>
  );
}

function EventClassTableRow({ eventClass }: { eventClass: string | EventClass }) {
  return (
    <TableRow>
      {typeof eventClass === 'string'
        ? <SimpleEventClass eventClass={eventClass} />
        : <ComplexEventClass eventClass={eventClass} />
      }
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
      <TableCell component="th" scope="row">{eventClass.entries}/{eventClass.places} ({eventClass.members})</TableCell>
      <TableCell></TableCell>
    </>
  );
}
