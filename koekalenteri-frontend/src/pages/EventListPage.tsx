import { Box, Button, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import cloneDeep from 'lodash.clonedeep';
import { EventGridContainer } from '../layout';
import { useTranslation } from 'react-i18next';
import { useSnackbar } from 'notistack';
import { AuthPage } from './AuthPage';
import { AddCircleOutline, ContentCopyOutlined, DeleteOutline, EditOutlined } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { ADMIN_EDIT_EVENT, ADMIN_NEW_EVENT } from '../config';
import { useStores } from '../stores';
import { observer } from 'mobx-react-lite';
import { Event } from 'koekalenteri-shared/model';

export const EventListPage = observer(() => {
  const { t } = useTranslation();
  const { privateStore } = useStores();
  const { enqueueSnackbar } = useSnackbar();
  const navigate = useNavigate();

  const copyAction = async () => {
    if (privateStore.selectedEvent) {
      const newEvent: Partial<Event> = cloneDeep({ ...privateStore.selectedEvent });
      delete newEvent.id;
      delete newEvent.kcId;
      delete newEvent.state;
      delete newEvent.startDate;
      delete newEvent.endDate;
      delete newEvent.entryStartDate;
      delete newEvent.entryEndDate;
      privateStore.setNewEvent(newEvent);
      navigate(ADMIN_NEW_EVENT);
    }
  }

  const deleteAction = async () => {
    if (privateStore.selectedEvent) {
      try {
        await privateStore.deleteEvent(privateStore.selectedEvent);
      } catch (e: any) {
        enqueueSnackbar(e.message, { variant: 'error' });
      }
    }
  }

  return (
    <AuthPage>
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        '& .MuiDataGrid-root': {
          flexGrow: 1
        }
      }}>
        <Typography variant="h5">{t('events')}</Typography>
        <TextField sx={{ mt: 2, width: '300px' }} size="small" label="Hae" variant="outlined" disabled />
        <div>
          <FormControlLabel
            sx={{ ml: 0, mb: 2 }}
            value="withUpcomingEntry"
            checked={true}
            disabled
            control={<Switch />}
            label="Näytä myös menneet tapahtumat"
            labelPlacement="start"
          />
        </div>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<AddCircleOutline />} onClick={() => navigate(ADMIN_NEW_EVENT)}>{t('createEvent')}</Button>
          <Button startIcon={<EditOutlined />} disabled={!privateStore.selectedEvent} onClick={() => navigate(`${ADMIN_EDIT_EVENT}/${privateStore.selectedEvent?.id}`)}>{t('edit')}</Button>
          <Button startIcon={<ContentCopyOutlined />} disabled={!privateStore.selectedEvent} onClick={copyAction}>{t('copy')}</Button>
          <Button startIcon={<DeleteOutline />} disabled={!privateStore.selectedEvent} onClick={deleteAction}>{t('delete')}</Button>
        </Stack>
        <EventGridContainer />
      </Box>
    </AuthPage>
  )
});
