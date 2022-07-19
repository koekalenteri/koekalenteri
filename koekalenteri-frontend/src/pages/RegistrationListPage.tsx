import { Box, CircularProgress, Toolbar } from '@mui/material';
import type { ConfirmedEventEx, Registration } from 'koekalenteri-shared/model';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { getRegistration } from '../api/event';
import { LinkButton, RegistrationEventInfo, RegistrationList } from '../components';
import { Header } from '../layout';
import { useSessionStarted, useStores } from '../stores';

export function RegistrationListPage() {
  const params = useParams();
  const { publicStore } = useStores();
  const [loading, setLoading] = useState(true);
  const [event, setEvent] = useState<ConfirmedEventEx>();
  const [registration, setRegistration] = useState<Registration>();
  const [sessionStarted] = useSessionStarted();
  const { t } = useTranslation();

  useEffect(() => {
    const abort = new AbortController();
    async function get(eventType: string, id: string, registrationId: string) {
      const evt = await publicStore.get(eventType, id, abort.signal) as ConfirmedEventEx;
      const reg = await getRegistration(id, registrationId, abort.signal);
      setEvent(evt);
      setRegistration(reg);
      setLoading(false);
    }
    if (params.eventType && params.id && params.registrationId) {
      get(params.eventType, params.id, params.registrationId);
    }
    return () => abort.abort();
  }, [params, publicStore]);

  return (
    <>
      <Header title={t('entryList', { context: event?.eventType === 'other' ? '' : 'test' })} />
      <Box sx={{ p: 1, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Toolbar variant="dense" />{/* To allocate the space for fixed header */}
        <LinkButton sx={{ mb: 1 }} to="/" text={sessionStarted ? t('goBack') : t('goHome')} />
        <PageContent event={event} loading={loading} registration={registration} />
      </Box>
    </>
  )
}

function PageContent({ event, loading, registration }: { event?: ConfirmedEventEx, loading: boolean, registration?: Registration }) {
  if (!event) {
    return <CircularProgress />
  }
  return (
    <>
      <RegistrationEventInfo event={event} />
      <RegistrationList loading={loading} rows={registration ? [registration] : []} />
    </>
  );
}
