import { Box, Button, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import { EventGridContainer } from '../layout';
import { useTranslation } from 'react-i18next';
import { useSnackbar } from 'notistack';
import { AuthPage } from './AuthPage';
import { AddCircleOutline, DeleteOutline, EditOutlined } from '@mui/icons-material';
import { Link } from 'react-router-dom';
import { ADMIN_EDIT_EVENT, ADMIN_NEW_EVENT } from '../config';
import { useStores } from '../stores';
import { observer } from 'mobx-react-lite';

export const ListPage = observer(() => {
  const { t } = useTranslation();
  const { privateStore } = useStores();
  const { enqueueSnackbar } = useSnackbar();

  return (
    <AuthPage>
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
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
          <Link to={ADMIN_NEW_EVENT}><Button startIcon={<AddCircleOutline />}>{t('createEvent')}</Button></Link>
          <Link to={ADMIN_EDIT_EVENT}><Button startIcon={<EditOutlined />} disabled={!privateStore.selectedEvent}>Muokkaa</Button></Link>
          <Button startIcon={<DeleteOutline />} disabled={!privateStore.selectedEvent} onClick={async () => {
            if (privateStore.selectedEvent) {
              try {
                await privateStore.deleteEvent(privateStore.selectedEvent);
              } catch (e: any) {
                enqueueSnackbar(e.message, { variant: 'error' });
              }
            }
          }}>Poista</Button>
        </Stack>
        <EventGridContainer />
      </Box>
    </AuthPage>
  )
});
