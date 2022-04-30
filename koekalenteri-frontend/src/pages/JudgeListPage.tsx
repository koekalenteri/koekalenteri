import { CloudSync } from '@mui/icons-material';
import { Button, Stack } from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import { Judge } from 'koekalenteri-shared/model';
import { computed, toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuickSearchToolbar, StyledDataGrid } from '../components';
import { FullPageFlex } from '../layout';
import { useStores } from '../stores';
import { AuthPage } from './AuthPage';

interface JudgeColDef extends GridColDef {
  field: keyof Judge
}

export const JudgeListPage = observer(function JudgeListPage() {
  const [searchText, setSearchText] = useState('');
  const { t } = useTranslation();
  const { rootStore } = useStores();
  const columns: JudgeColDef[] = [
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
      flex: 1,
      headerName: t('registration.contact.city'),
    },
    {
      field: 'phone',
      flex: 1,
      headerName: t('registration.contact.phone'),
    },
    {
      field: 'email',
      flex: 2,
      headerName: t('registration.contact.email'),
    },
    {
      field: 'district',
      flex: 1,
      headerName: 'Kennelpiiri'
    },
    {
      field: 'eventTypes',
      flex: 2,
      headerName: t('eventTypes'),
      valueGetter: (params) => params.row.eventTypes?.join(', ')
    }
  ];

  const refresh = async () => {
    rootStore.judgeStore.load(true);
  };

  const rows = computed(() => {
    const lvalue = searchText.toLocaleLowerCase();
    return toJS(rootStore.judgeStore.judges).filter(o => o.search.includes(lvalue));
  }).get();

  const requestSearch = (searchValue: string) => {
    setSearchText(searchValue);
  };

  return (
    <AuthPage title={t('judges')}>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<CloudSync />} onClick={refresh}>{t('updateData', { data: 'judges' })}</Button>
        </Stack>

        <StyledDataGrid
          loading={rootStore.judgeStore.loading}
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
