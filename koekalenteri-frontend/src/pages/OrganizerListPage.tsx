import { CloudSync } from '@mui/icons-material';
import { Button, Stack } from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import { Organizer } from 'koekalenteri-shared/model';
import { computed, toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuickSearchToolbar, StyledDataGrid } from '../components';
import { FullPageFlex } from '../layout';
import { useStores } from '../stores';
import { AuthPage } from './AuthPage';

interface OrganizerColDef extends GridColDef {
  field: keyof Organizer
}

export const OrganizerListPage = observer(function OrganizerListPage() {
  const [searchText, setSearchText] = useState('');
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

  const rows = computed(() => {
    const lvalue = searchText.toLocaleLowerCase();
    return toJS(rootStore.organizerStore.organizers).filter(o => o.search.includes(lvalue));
  }).get();

  const requestSearch = (searchValue: string) => {
    setSearchText(searchValue);
  };

  return (
    <AuthPage title={t('organizations')}>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<CloudSync />} onClick={refresh}>{t('updateData', { data: 'organizations' })}</Button>
        </Stack>

        <StyledDataGrid
          loading={rootStore.organizerStore.loading}
          autoPageSize
          columns={columns}
          components={{ Toolbar: QuickSearchToolbar }}
          componentsProps={{
            toolbar: {
              value: searchText,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                requestSearch(event.target.value),
              clearSearch: () => requestSearch(''),
            },
          }}
          density='compact'
          disableColumnMenu
          disableVirtualization
          rows={rows}
        />
      </FullPageFlex>
    </AuthPage>
  )
});
