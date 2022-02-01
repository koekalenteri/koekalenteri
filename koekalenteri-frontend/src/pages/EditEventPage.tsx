import { Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { AuthPage } from './AuthPage';
import { EventForm } from '../components';
import { useStores } from '../stores';
import { useNavigate } from 'react-router-dom';
import { ADMIN_EVENTS } from '../config';

export function EditEventPage({create}: {create?: boolean}) {
  const { t } = useTranslation();
  const { eventStore, judgeStore } = useStores();
  const naviage = useNavigate();

  return (
    <AuthPage>
      <Typography variant="h5" sx={{pb: 1}}>{create ? t('createEvent') : 'Muokkaa tapahtumaa'}</Typography>
      <EventForm
        event={!create && eventStore.selectedEvent ? eventStore.selectedEvent : eventStore.newEvent}
        judges={judgeStore.judges}
        onSave={async (event) => {
          await eventStore.save(event)
          naviage(ADMIN_EVENTS);
        }}
        onCancel={(event) => {
          if (create) {
            eventStore.newEvent = { ...event }
          }
          naviage(ADMIN_EVENTS);
        }}
      />
    </AuthPage>
  )
}

