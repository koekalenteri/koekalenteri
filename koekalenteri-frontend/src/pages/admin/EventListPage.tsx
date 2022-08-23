import { AddCircleOutline, ContentCopyOutlined, DeleteOutline, EditOutlined, FormatListNumberedOutlined } from '@mui/icons-material';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, Stack, Switch, TextField } from '@mui/material';
import { Event } from 'koekalenteri-shared/model';
import cloneDeep from 'lodash.clonedeep';
import { observer } from 'mobx-react-lite';
import { useSnackbar } from 'notistack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { AutoButton } from '../../components';
import { ADMIN_EDIT_EVENT, ADMIN_NEW_EVENT, ADMIN_VIEW_EVENT } from '../../config';
import { EventGridContainer, FullPageFlex } from '../../layout';
import { useStores } from '../../stores';
import { AuthPage } from './AuthPage';

export const EventListPage = observer(function EventListPage() {
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
          <Button onClick={deleteAction} autoFocus>{t('delete')}</Button>
          <Button onClick={handleClose} variant="outlined">{t('cancel')}</Button>
        </DialogActions>
      </Dialog>
    </AuthPage>
  )
});
