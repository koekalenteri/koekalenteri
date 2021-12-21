import { Box, Button, FormControlLabel, Stack, Switch, TextField, Typography } from '@mui/material';
import { EventGridContainer } from '../layout';
import { useTranslation } from 'react-i18next';
import { AuthPage } from './AuthPage';
import { AddCircleOutline, DeleteOutline, EditOutlined } from '@mui/icons-material';

export function ListPage() {
  const { t } = useTranslation();

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
            sx={{ml: 0, mb: 2}}
            value="withUpcomingEntry"
            checked={true}
            disabled
            control={<Switch />}
            label="Näytä myös menneet tapahtumat"
            labelPlacement="start"
          />
        </div>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<AddCircleOutline />}>Uusi tapahtuma</Button>
          <Button startIcon={<EditOutlined />}>Muokkaa</Button>
          <Button startIcon={<DeleteOutline />}>Poista</Button>
        </Stack>
        <EventGridContainer />
      </Box>
    </AuthPage>
  )
}

