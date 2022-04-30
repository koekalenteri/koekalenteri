import { Box, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import cloneDeep from 'lodash.clonedeep';
import { EventGridContainer, FullPageFlex } from '../layout';
import { useTranslation } from 'react-i18next';
import { useSnackbar } from 'notistack';
import { AuthPage } from './AuthPage';
import { AddCircleOutline, ContentCopyOutlined, DeleteOutline, EditOutlined, FormatListNumberedOutlined } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { ADMIN_EDIT_EVENT, ADMIN_NEW_EVENT, ADMIN_VIEW_EVENT } from '../config';
import { useStores } from '../stores';
import { observer } from 'mobx-react-lite';
import { Event } from 'koekalenteri-shared/model';
import { useState } from 'react';
import { AutoButton } from '../components';

export const EventListPage = observer(() => {
  const { t } = useTranslation();
  const { privateStore } = useStores();
  const { enqueueSnackbar } = useSnackbar();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleClose = () => {
    setOpen(false);
  };

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
      setOpen(false);
      try {
        await privateStore.deleteEvent(privateStore.selectedEvent);
        enqueueSnackbar(t('deleteEventComplete'), { variant: 'info' });
      } catch (e: any) {
        enqueueSnackbar(e.message, { variant: 'error' });
      }
    }
  }

  return (
    <AuthPage title={t('events')}>
      <FullPageFlex>
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
          <AutoButton startIcon={<AddCircleOutline />} onClick={() => navigate(ADMIN_NEW_EVENT)} text={t('createEvent')} />
          <AutoButton startIcon={<EditOutlined />} disabled={!privateStore.selectedEvent} onClick={() => navigate(`${ADMIN_EDIT_EVENT}/${privateStore.selectedEvent?.id}`)} text={t('edit')} />
          <AutoButton startIcon={<ContentCopyOutlined />} disabled={!privateStore.selectedEvent} onClick={copyAction} text={t('copy')} />
          <AutoButton startIcon={<DeleteOutline />} disabled={!privateStore.selectedEvent} onClick={() => setOpen(true)} text={t('delete')} />
          <AutoButton startIcon={<FormatListNumberedOutlined />} disabled={!privateStore.selectedEvent || !privateStore.selectedEvent.entries} onClick={() => navigate(`${ADMIN_VIEW_EVENT}/${privateStore.selectedEvent?.id}`)} text={t('registrations')} />
        </Stack>
        <EventGridContainer />
      </FullPageFlex>
      <Dialog
        open={open}
        onClose={handleClose}
        aria-labelledby="delete-dialog-title"
        aria-describedby="delete-dialog-description"
      >
        <DialogTitle id="delete-dialog-title">
          {t('deleteEventTitle')}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="delete-dialog-description">
            {t('deleteEventText')}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>{t('cancel')}</Button>
          <Button onClick={deleteAction} autoFocus>{t('delete')}</Button>
        </DialogActions>
      </Dialog>
    </AuthPage>
  )
});
