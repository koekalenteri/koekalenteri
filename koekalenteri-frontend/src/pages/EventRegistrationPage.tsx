import { useEffect, useState } from 'react';
import { Box, CircularProgress, Grid, Paper, Toolbar, Typography } from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import { Header } from '../layout';
import { useSessionStarted, useStores } from '../stores';
import type { ConfirmedEventEx, Registration } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { entryDateColor } from '../utils';
import { CollapsibleSection, CostInfo, LinkButton, RegistrationForm } from '../components';
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
      <Header title={t('entryTitle', { context: event?.eventType === 'other' ? '' : 'test' })} />
      <Box sx={{ p: 1, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Toolbar variant="dense" />{/* To allocate the space for fixed header */}
        <LinkButton sx={{mb: 1}} to="/" text={sessionStarted ? t('goBack') : t('goHome')} />
        {event ? <EventComponent event={event} classDate={params.date} className={params.class} /> : <CircularProgress />}
      </Box>
    </>
  )
}

function EventComponent({ event, classDate = '', className = '' }: { event: ConfirmedEventEx, classDate?: string, className?: string }) {
  const { enqueueSnackbar } = useSnackbar();
  const { publicStore } = useStores();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const onSave = async (registration: Registration) => {
    try {
      const saved = await putRegistration(registration);
      console.log(saved);
      publicStore.load(); // TODO: Use MobX properly
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
      <Paper sx={{ p: 1, mb: 1, width: '100%' }} elevation={2}>
        <Typography variant="h5" sx={{fontWeight: 'bold', mb: 1}}>
          {event.eventType} {t('daterange', { start: event.startDate, end: event.endDate })} {event.location + (event.name ? ` (${event.name})` : '')}
        </Typography>
        <CollapsibleSection title="Kokeen tiedot">
          <Grid container justifyContent="space-between" alignItems="flex-start"
            sx={{ '& .MuiGrid-item': { overflow: 'hidden', textOverflow: 'ellipsis' } }}
          >
            <Grid item container sm={12} md columnSpacing={1}>
              <Grid item xs={4}>{t('entryTime')}:</Grid>
              <Grid item xs={8} sx={{ color: entryDateColor(event) }}>
                <b>{t('daterange', { start: event.entryStartDate, end: event.entryEndDate })}</b>&nbsp;
                {event.isEntryOpen ? t('distanceLeft', { date: event.entryEndDate }) : ''}
              </Grid>
              <Grid item xs={4}>{t('event.organizer')}:</Grid>
              <Grid item xs={8}>{event.organizer?.name}</Grid>
              <Grid item xs={4}>{t('event.judges')}:</Grid>
              <Grid item xs={8}>{event.judges[0]}</Grid>
              <Grid item xs={4}>{t('event.official')}:</Grid>
              <Grid item xs={8}>{event.official?.name || ''}</Grid>
            </Grid>
            <Grid item container sm={12} md columnSpacing={1}>
              <Grid item xs={4}>{t('event.paymentDetails')}:</Grid>
              <Grid item xs={8}><CostInfo event={event} /></Grid>
              <Grid item xs={4}>{t('event.description')}:</Grid>
              <Grid item xs={8}>{event.description}</Grid>
            </Grid>
          </Grid>
        </CollapsibleSection>
      </Paper>
      <RegistrationForm event={event} className={className} classDate={classDate} onSave={onSave} onCancel={onCancel}/>
    </>
  );
}
