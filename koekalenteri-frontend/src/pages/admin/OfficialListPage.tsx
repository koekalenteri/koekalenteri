import { CloudSync } from '@mui/icons-material';
import { Button, Stack, Theme, useMediaQuery } from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import { computed, toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuickSearchToolbar, StyledDataGrid } from '../../components';
import { FullPageFlex } from '../../layout';
import { useStores } from '../../stores';
import { COfficial } from '../../stores/classes/COfficial';
import { AuthPage } from './AuthPage';

interface OfficialColDef extends GridColDef {
  field: keyof COfficial
}

export const OfficialListPage = observer(function OfficialListPage() {
  const [searchText, setSearchText] = useState('');
  const large = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'));
  const { rootStore } = useStores();
  const { t } = useTranslation();
  const columns: OfficialColDef[] = [
    {
      field: 'name',
      flex: 1,
      headerName: t('name'),
      minWidth: 150,
    },
    {
      field: 'id',
      flex: 0,
      headerName: t('id'),
      width: 80
    },
    {
      field: 'location',
      flex: 0,
      headerName: t('registration.contact.city'),
      width: 120
    },
    {
      field: 'phone',
      flex: 0,
      headerName: t('registration.contact.phone'),
      width: 150
    },
    {
      field: 'email',
      flex: 1,
      headerName: t('registration.contact.email'),
      minWidth: 150,
    },
    {
      field: 'district',
      flex: 1,
      headerName: t('district')
    },
    {
      field: 'eventTypes',
      flex: 1,
      headerName: t('eventTypes'),
      valueGetter: (params) => params.row.eventTypes?.join(', ')
    }
  ];

  const refresh = async () => {
    rootStore.officialStore.load(true);
  };

  const rows = computed(() => {
    const lvalue = searchText.toLocaleLowerCase();
    return toJS(rootStore.officialStore.officials).filter(o => o.search.includes(lvalue));
  }).get();

  const requestSearch = (searchValue: string) => {
    setSearchText(searchValue);
  };

  return (
    <AuthPage title={t('officials')}>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<CloudSync />} onClick={refresh}>{t('updateData', { data: 'officials' })}</Button>
        </Stack>

        <StyledDataGrid
          autoPageSize
          columns={columns}
          columnVisibilityModel={{
            district: large,
            eventTypes: large,
            id: large,
            location: large,
          }}
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
          loading={rootStore.officialStore.loading}
          rows={rows}
        />
      </FullPageFlex>
    </AuthPage>
  )
});
