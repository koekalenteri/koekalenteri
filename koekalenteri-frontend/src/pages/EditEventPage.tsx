import { Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { useSnackbar } from 'notistack';
import { AuthPage } from './AuthPage';
import { EventForm } from '../components';
import { useStores } from '../stores';
import { useNavigate } from 'react-router-dom';
import { ADMIN_EVENTS } from '../config';

export function EditEventPage({create}: {create?: boolean}) {
  const { t } = useTranslation();
  const { t: ts } = useTranslation('states');
  const { publicStore, privateStore } = useStores();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();

  return (
    <AuthPage>
      <Typography variant="h5" sx={{pb: 1}}>{create ? t('createEvent') : 'Muokkaa tapahtumaa'}</Typography>
      <EventForm
        event={!create && privateStore.selectedEvent ? privateStore.selectedEvent : privateStore.newEvent}
        eventTypes={publicStore.eventTypes}
        eventTypeClasses={publicStore.eventTypeClasses}
        judges={publicStore.judges}
        officials={privateStore.officials}
        organizers={publicStore.organizers}
        onSave={async (event) => {
          try {
            await privateStore.saveEvent(event)
            navigate(ADMIN_EVENTS);
            enqueueSnackbar(ts(event.state || 'draft', { context: 'save' }), { variant: 'info' });
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
      />
    </AuthPage>
  )
}

