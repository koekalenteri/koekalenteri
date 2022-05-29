import { CheckBoxOutlineBlankOutlined, CheckBoxOutlined, CloudSync } from '@mui/icons-material';
import { Button, Stack, Switch } from '@mui/material';
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { computed, toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuickSearchToolbar, StyledDataGrid } from '../../components';
import { FullPageFlex } from '../../layout';
import { useStores } from '../../stores';
import { CEventType } from '../../stores/classes/CEventType';
import { AuthPage } from './AuthPage';

interface EventTypeColDef extends GridColDef {
  field: keyof CEventType
}

export const EventTypeListPage = observer(function EventTypeListPage()  {
  const [searchText, setSearchText] = useState('');
  const { t, i18n } = useTranslation();
  const { rootStore } = useStores();
  const columns: EventTypeColDef[] = [
    {
      field: 'eventType',
      headerName: t('eventType', { context: 'short' })
    },
    {
      align: 'center',
      field: 'official',
      headerName: t('official'),
      renderCell: (params) => params.value ? <CheckBoxOutlined /> : <CheckBoxOutlineBlankOutlined />,
      width: 80
    },
    {
      field: 'active',
      headerName: t('active'),
      renderCell: (params: GridRenderCellParams<CEventType, CEventType>) => <Switch checked={!!params.value} onChange={async (_e, checked) => {
        try {
          params.row.active = checked;
          const props: any = { ...params.row };
          delete props.store;
          delete props.search;
          await params.row.store.rootStore.eventTypeStore.save(props);
        } catch(err) {
          console.log(err);
        }
      }} />,
      width: 80
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
