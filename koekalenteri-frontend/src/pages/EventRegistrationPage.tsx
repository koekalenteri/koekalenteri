import { useEffect, useState } from 'react';
import { Box, CircularProgress, Table, TableBody, TableCell, TableRow, Toolbar, Typography } from '@mui/material';
import { makeStyles } from '@mui/styles';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../layout';
import { useSessionStarted, useStores } from '../stores';
import type { ConfirmedEventEx, Registration } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { entryDateColor } from '../utils';
import { CostInfo, LinkButton, RegistrationForm } from '../components';
import { putRegistration } from '../api/event';
import { useSnackbar } from 'notistack';

export const EventRegistrationPage = () => {
  const params = useParams();
  const { publicStore } = useStores();
  const [event, setEvent] = useState<ConfirmedEventEx>();
  const [sessionStarted] = useSessionStarted();
  const { t } = useTranslation();

  useEffect(() => {
    const abort = new AbortController();
    async function get(eventType: string, id: string) {
      const result = await publicStore.get(eventType, id, abort.signal) as ConfirmedEventEx;
      setEvent(result);
    }
    if (params.eventType && params.id) {
      get(params.eventType, params.id);
    }
    return () => abort.abort();
  }, [params, publicStore]);

  return (
    <>
      <Header title="Ilmoittaudu kokeeseen" />
      <Box sx={{ p: 1, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Toolbar variant="dense" />{/* To allocate the space for fixed header */}
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

function EventComponent({ event, classDate = '', className = '' }: { event: ConfirmedEventEx, classDate?: string, className?: string }) {
  const { enqueueSnackbar } = useSnackbar();
  const { publicStore } = useStores();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const classes = useStyles();
  const onSave = async (registration: Registration) => {
    try {
      const saved = await putRegistration(registration);
      console.log(saved);
      publicStore.load(true); // Update registraion counts for the event. This is not optimal, but does not probably matter.
      navigate('/', { replace: true });
      const emails = [saved.handler.email];
      if (saved.owner.email !== saved.handler.email) {
        emails.push(saved.owner.email);
      }
      enqueueSnackbar(t('registration.saved', { count: emails.length, to: emails.join("\n") }), { variant: 'success', style: { whiteSpace: 'pre-line' } });
      return true;
    } catch (e: any) {
      console.error(e);
      return false;
    }
  }
  const onCancel = async () => {
    navigate('/');
    return true;
  }
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
              <TableCell component="th" scope="row">{t('event.organizer')}:</TableCell>
              <TableCell>{event.organizer?.name}</TableCell>
            </TableRow>
            <TableRow key={event.id + 'judge' + event.judges[0]}>
              <TableCell component="th" scope="row" rowSpan={event.judges.length}>{t('event.judges')}:</TableCell>
              <TableCell>{event.judges[0]}</TableCell>
            </TableRow>
            <TableRow key={event.id + 'official'}>
              <TableCell component="th" scope="row">{t('event.official')}:</TableCell>
              <TableCell>{event.official?.name || ''}</TableCell>
            </TableRow>
            <TableRow key={event.id + 'payment'}>
              <TableCell component="th" scope="row">{t('event.paymentDetails')}:</TableCell>
              <TableCell><CostInfo event={event} /></TableCell>
            </TableRow>
            <TableRow key={event.id + 'description'}>
              <TableCell component="th" scope="row">{t('event.description')}:</TableCell>
              <TableCell>{event.description}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Box>
      <RegistrationForm event={event} className={className} classDate={classDate} onSave={onSave} onCancel={onCancel}/>
    </>
  );
}
