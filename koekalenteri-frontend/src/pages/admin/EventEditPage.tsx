import { CircularProgress } from '@mui/material';
import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useSnackbar } from 'notistack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { EventForm } from '../../components';
import { ADMIN_EVENTS } from '../../config';
import { useStores } from '../../stores';
import { AuthPage } from './AuthPage';

export const EventEditPage = observer(function EventEditPage({create}: {create?: boolean}) {
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
          event={toJS(! create && privateStore.selectedEvent ? privateStore.selectedEvent : privateStore.newEvent)}
          eventTypes={rootStore.eventTypeStore.activeEventTypes.map(et => et.eventType)}
          eventTypeClasses={publicStore.eventTypeClasses}
          judges={rootStore.judgeStore.activeJudges.map(j => j.toJSON())}
          officials={rootStore.officialStore.officials.map(o => o.toJSON())}
          organizers={rootStore.organizerStore.organizers.map(o => o.toJSON())}
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
})
