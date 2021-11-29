import { useEffect, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';
import { Header } from '../layout';
import { useSessionStarted, useStores } from '../stores';
import { EventEx } from 'koekalenteri-shared';
import { useTranslation } from 'react-i18next';
import { RegistrationForm } from '../components/RegistrationForm';
import { LinkButton } from '../components/Buttons';

export const EventPage = () => {
  const params = useParams();
  const { eventStore } = useStores();
  const [event, setEvent] = useState<EventEx>();
  const [sessionStarted] = useSessionStarted();
  const { t } = useTranslation();

  useEffect(() => {
    const abort = new AbortController();
    async function get(eventType: string, id: string) {
      const result = await eventStore.get(eventType, id, abort.signal);
      setEvent(result);
    }
    if (params.eventType && params.id) {
      get(params.eventType, params.id);
    }
    return () => abort.abort();
  }, [params, eventStore]);

  return (
    <>
      <Header small />
      <Box m={1}>
        <LinkButton sx={{mb: 1}} to="/" text={sessionStarted ? t('go_back') : t('go_home')} />
        {event ? <EventComponent event={event} classDate={params.date} className={params.class} /> : <CircularProgress />}
      </Box>
    </>
  )
}

function EventComponent({ event, classDate = '', className = '' }: { event: EventEx, classDate?: string, className?: string }) {
  const { t } = useTranslation();

  return (
    <>
      <Typography variant="h5">{t('entryTitle', { context: event.eventType === 'other' ? '' : 'test' })}</Typography>
      <Typography variant="h5" sx={{fontWeight: 'bold', mb: 1}}>{
        t('daterange', { start: event.startDate, end: event.endDate }) +
        ' ' + event.location + (event.name ? ` (${event.name})` : '')}
      </Typography>
      <Box sx={{ mb: 1 }}>
        Imoaika<br/>
        Järjestäjä: {event.organizer?.name}<br/>
        Tuomari<br/>
        Vastaava koetoimitsija<br/>
        Maksutiedot<br/>
        Lisätiedot<br/>
      </Box>
      <RegistrationForm event={event} className={className} classDate={classDate} />
    </>
  );
}
