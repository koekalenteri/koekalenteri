import { CheckBoxOutlineBlankOutlined, CheckBoxOutlined, CloudSync } from '@mui/icons-material';
import { Button, Stack, Switch, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid';
import { Judge } from 'koekalenteri-shared/model';
import { computed, toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QuickSearchToolbar, StyledDataGrid } from '../components';
import { FullPageFlex } from '../layout';
import { useStores } from '../stores';
import { CJudge } from '../stores/classes/CJudge';
import { AuthPage } from './AuthPage';

interface JudgeColDef extends GridColDef {
  field: keyof Judge
}

export const JudgeListPage = observer(function JudgeListPage() {
  const [searchText, setSearchText] = useState('');
  const { t } = useTranslation();
  const { rootStore } = useStores();
  const saveJudge = async (judge: CJudge) => {
    try {
      const props: any = { ...judge };
      delete props.store;
      delete props.search;
      await judge.store.rootStore.judgeStore.save(props);
    } catch(err) {
      console.log(err);
    }
  }
  const columns: JudgeColDef[] = [
    {
      field: 'active',
      headerName: t('judgeActive'),
      renderCell: (params: GridRenderCellParams<CJudge, CJudge>) => <Switch checked={!!params.value} onChange={async (_e, checked) => {
        params.row.active = checked;
        saveJudge(params.row);
      }} />,
      width: 90
    },
    {
      align: 'center',
      field: 'official',
      headerName: t('official'),
      renderCell: (params) => params.value ? <CheckBoxOutlined /> : <CheckBoxOutlineBlankOutlined />,
      width: 80
    },
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
    },
    {
      field: 'languages',
      flex: 0,
      headerName: t('languages'),
      renderCell: (params: GridRenderCellParams<CJudge, CJudge>) =>
        <ToggleButtonGroup
          value={params.value}
          fullWidth
          onChange={(_e, value) => {
            params.row.languages = value;
            saveJudge(params.row);
          }}
        >
          <ToggleButton value="fi">{t('language.fi')}</ToggleButton>
          <ToggleButton value="sv">{t('language.sv')}</ToggleButton>
          <ToggleButton value="en">{t('language.en')}</ToggleButton>
        </ToggleButtonGroup>,
      width: 220
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
