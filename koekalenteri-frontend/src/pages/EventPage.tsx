import { useEffect, useState } from 'react';
import { Box, CircularProgress, Table, TableBody, TableCell, TableRow, Toolbar, Typography } from '@mui/material';
import { makeStyles } from '@mui/styles';
import { useParams } from 'react-router-dom';
import { Header } from '../layout';
import { useSessionStarted, useStores } from '../stores';
import type { EventEx } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { RegistrationForm } from '../components/RegistrationForm';
import { LinkButton } from '../components/Buttons';
import { entryDateColor } from '../utils';

export const EventPage = () => {
  const params = useParams();
  const { publicStore } = useStores();
  const [event, setEvent] = useState<EventEx>();
  const [sessionStarted] = useSessionStarted();
  const { t } = useTranslation();

  useEffect(() => {
    const abort = new AbortController();
    async function get(eventType: string, id: string) {
      const result = await publicStore.get(eventType, id, abort.signal);
      setEvent(result);
    }
    if (params.eventType && params.id) {
      get(params.eventType, params.id);
    }
    return () => abort.abort();
  }, [params, publicStore]);

  return (
    <>
      <Header />
      <Toolbar variant="dense" />{/* To allocate the space for fixed header */}
      <Box m={1}>
        <LinkButton sx={{mb: 1}} to="/" text={sessionStarted ? t('goBack') : t('goHome')} />
        {event ? <EventComponent event={event} classDate={params.date} className={params.class} /> : <CircularProgress />}
      </Box>
    </>
  )
}

const useStyles = makeStyles({
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

function EventComponent({ event, classDate = '', className = '' }: { event: EventEx, classDate?: string, className?: string }) {
  const { t } = useTranslation();
  const { t: te } = useTranslation('event');
  const classes = useStyles();
  return (
    <>
      <Typography variant="h5">{t('entryTitle', { context: event.eventType === 'other' ? '' : 'test' })}</Typography>
      <Typography variant="h5" sx={{fontWeight: 'bold', mb: 1}}>{
        t('daterange', { start: event.startDate, end: event.endDate }) +
        ' ' + event.location + (event.name ? ` (${event.name})` : '')}
      </Typography>
      <Box sx={{ mb: 1 }}>
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
            <TableRow key={event.id + 'judge' + event.judges[0]}>
              <TableCell component="th" scope="row" rowSpan={event.judges.length}>{te('judges')}:</TableCell>
              <TableCell>{event.judges[0]}</TableCell>
            </TableRow>
            <TableRow key={event.id + 'official'}>
              <TableCell component="th" scope="row">{t('official')}:</TableCell>
              <TableCell>{event.official?.name || ''}</TableCell>
            </TableRow>
            <TableRow key={event.id + 'payment'}>
              <TableCell component="th" scope="row">{t('paymentDetails')}:</TableCell>
              <TableCell>{event.paymentDetails}</TableCell>
            </TableRow>
            <TableRow key={event.id + 'description'}>
              <TableCell component="th" scope="row">{te('description')}:</TableCell>
              <TableCell>{event.description}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Box>
      <RegistrationForm event={event} className={className} classDate={classDate} />
    </>
  );
}
