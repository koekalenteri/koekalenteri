import { CircularProgress } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useSnackbar } from 'notistack';
import { AuthPage } from './AuthPage';
import { EventForm } from '../components';
import { useStores } from '../stores';
import { useNavigate, useParams } from 'react-router-dom';
import { ADMIN_EVENTS } from '../config';
import { useEffect, useState } from 'react';

export function EventEditPage({create}: {create?: boolean}) {
  const params = useParams();
  const { t } = useTranslation();
  const { rootStore, publicStore, privateStore } = useStores();
  const { enqueueSnackbar } = useSnackbar();
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const abort = new AbortController();
    async function get(id: string) {
      const result = await privateStore.get(id, abort.signal);
      privateStore.setSelectedEvent(result);
      setLoading(false);
    }
    if (params.id && privateStore.selectedEvent?.id !== params.id) {
      get(params.id);
    } else {
      setLoading(false);
    }
    return () => abort.abort();
  }, [params, privateStore]);

  return (
    <AuthPage title={create ? t('createEvent') : 'Muokkaa tapahtumaa'}>
      {loading
        ? <CircularProgress />
        : <EventForm
          event={!create && privateStore.selectedEvent ? privateStore.selectedEvent : privateStore.newEvent}
          eventTypes={publicStore.eventTypes}
          eventTypeClasses={publicStore.eventTypeClasses}
          judges={rootStore.judgeStore.judges}
          officials={privateStore.officials}
          organizers={rootStore.organizerStore.organizers}
          onSave={async (event) => {
            try {
              await privateStore.putEvent(event)
              navigate(ADMIN_EVENTS);
              enqueueSnackbar(t(`event.states.${event.state || 'draft'}`, { context: 'save' }), { variant: 'info' });
              return Promise.resolve(true);
            } catch (e: any) {
              enqueueSnackbar(e.message, { variant: 'error' });
              return Promise.resolve(false);
            }
          }}
          onCancel={(event) => {
            if (create) {
              privateStore.newEvent = { ...event }
            }
            navigate(ADMIN_EVENTS);
            return Promise.resolve(true);
          }}
        />}
    </AuthPage>
  )
}
