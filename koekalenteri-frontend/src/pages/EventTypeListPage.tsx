import { CloudSync } from '@mui/icons-material';
import { Box, Button, Stack } from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import { EventType } from 'koekalenteri-shared/model';
import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { StyledDataGrid } from '../components';
import { useStores } from '../stores';
import { AuthPage } from './AuthPage';

interface EventTypeColDef extends GridColDef {
  field: keyof EventType
}

export const EventTypeListPage = observer(function EventTypeListPage()  {
  const { t, i18n } = useTranslation();
  const { rootStore: {eventTypeStore} } = useStores();
  const columns: EventTypeColDef[] = [
    {
      field: 'eventType',
      headerName: t('eventType', {context: 'short'})
    },
    {
      field: 'description',
      headerName: t('eventType'),
      flex: 1,
      valueGetter: (params) => params.value[i18n.language]
    }
  ];

  const refresh = async () => {
    eventTypeStore.load(true);
  };

  return (
    <AuthPage title={t('eventTypes')}>
      <Box sx={{ display: 'flex', p: 1, overflow: 'hidden', height: '100%', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          width: '100%',
          minHeight: 600,
        }}>
          <Stack direction="row" spacing={2}>
            <Button startIcon={<CloudSync />} onClick={refresh}>{t('updateData', {data: 'eventTypes'})}</Button>
          </Stack>

          <StyledDataGrid
            loading={eventTypeStore.loading}
            autoPageSize
            columns={columns}
            density='compact'
            disableColumnMenu
            rows={toJS(eventTypeStore.eventTypes)}
            getRowId={(row) => row.eventType}
          />
        </Box>
      </Box>
    </AuthPage>
  )
})
