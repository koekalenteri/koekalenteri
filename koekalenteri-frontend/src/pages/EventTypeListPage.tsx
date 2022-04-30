import { CloudSync } from '@mui/icons-material';
import { Button, Stack } from '@mui/material';
import { GridColDef } from '@mui/x-data-grid';
import { EventType } from 'koekalenteri-shared/model';
import { computed, toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuickSearchToolbar, StyledDataGrid } from '../components';
import { FullPageFlex } from '../layout';
import { useStores } from '../stores';
import { AuthPage } from './AuthPage';

interface EventTypeColDef extends GridColDef {
  field: keyof EventType
}

export const EventTypeListPage = observer(function EventTypeListPage()  {
  const [searchText, setSearchText] = useState('');
  const { t, i18n } = useTranslation();
  const { rootStore } = useStores();
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
    rootStore.eventTypeStore.load(true);
  };

  const rows = computed(() => {
    const lvalue = searchText.toLocaleLowerCase();
    return toJS(rootStore.eventTypeStore.eventTypes).filter(o => o.search.includes(lvalue));
  }).get();

  const requestSearch = (searchValue: string) => {
    setSearchText(searchValue);
  };

  return (
    <AuthPage title={t('eventTypes')}>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<CloudSync />} onClick={refresh}>{t('updateData', {data: 'eventTypes'})}</Button>
        </Stack>

        <StyledDataGrid
          loading={rootStore.eventTypeStore.loading}
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
          rows={rows}
          getRowId={(row) => row.eventType}
        />
      </FullPageFlex>
    </AuthPage>
  )
})
