import { Box, CircularProgress, Toolbar } from '@mui/material';
import type { ConfirmedEventEx, Registration } from 'koekalenteri-shared/model';
import { observer } from 'mobx-react-lite';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { putRegistration } from '../api/event';
import { LinkButton, RegistrationEventInfo, RegistrationForm } from '../components';
import { Header } from '../layout';
import { useSessionStarted, useStores } from '../stores';

export const RegistrationPage = observer(function EventRegistrationPage() {
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();
  const params = useParams();
  const { publicStore } = useStores();
  const [event, setEvent] = useState<ConfirmedEventEx>();
  const [sessionStarted] = useSessionStarted();
  const { t } = useTranslation();

  const onSave = async (registration: Registration) => {
    try {
      const saved = await putRegistration(registration);
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
        <LinkButton sx={{ mb: 1 }} to="/" text={sessionStarted ? t('goBack') : t('goHome')} />
        {event ?
          <>
            <RegistrationEventInfo event={event} />
            <RegistrationForm event={event} className={params.class} classDate={params.date} onSave={onSave} onCancel={onCancel} />
          </>
          :
          <CircularProgress />
        }
      </Box>
    </>
  )
})

