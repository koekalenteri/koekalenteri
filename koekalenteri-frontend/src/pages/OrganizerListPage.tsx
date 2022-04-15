import { CloudSync } from '@mui/icons-material';
import { Box, Button, Stack } from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import { Organizer } from 'koekalenteri-shared/model';
import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useTranslation } from 'react-i18next';
import { StyledDataGrid } from '../components';
import { useStores } from '../stores';
import { AuthPage } from './AuthPage';

interface OrganizerColDef extends GridColDef {
  field: keyof Organizer
}

export const OrganizerListPage = observer(function OrganizerListPage()  {
  const { t } = useTranslation();
  const { rootStore } = useStores();
  const columns: OrganizerColDef[] = [
    {
      field: 'id',
      headerName: t('id')
    },
    {
      field: 'name',
      headerName: t('name'),
      flex: 2
    }
  ];

  const refresh = async () => {
    rootStore.organizerStore.load(true);
  };

  return (
    <AuthPage title={t('organizations')}>
      <Box sx={{ display: 'flex', p: 1, overflow: 'hidden', height: '100%', flexDirection: 'column', alignItems: 'flex-start' }}>
        <Box sx={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          width: '100%',
          minHeight: 600,
        }}>
          <Stack direction="row" spacing={2}>
            <Button startIcon={<CloudSync />} onClick={refresh}>{t('updateData', { data: 'organizations' })}</Button>
          </Stack>

          <StyledDataGrid
            loading={rootStore.organizerStore.loading}
            autoPageSize
            columns={columns}
            density='compact'
            disableColumnMenu
            disableVirtualization
            rows={toJS(rootStore.organizerStore.organizers)}
          />
        </Box>
      </Box>
    </AuthPage>
  )
});
