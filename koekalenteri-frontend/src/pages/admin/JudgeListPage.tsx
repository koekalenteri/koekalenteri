import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckBoxOutlineBlankOutlined, CheckBoxOutlined, CloudSync } from '@mui/icons-material'
import { Button, Stack, Switch, ToggleButton, ToggleButtonGroup } from '@mui/material'
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid'
import { Judge } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import { QuickSearchToolbar, StyledDataGrid } from '../../components'
import { filteredJudgesQuery, judgeFilterAtom, useJudgesActions } from '../recoil/judges'

import FullPageFlex from './components/FullPageFlex'

interface JudgeColDef extends GridColDef {
  field: keyof Judge
}

export const JudgeListPage = () => {
  const [searchText, setSearchText] = useRecoilState(judgeFilterAtom)
  const { t } = useTranslation()
  const judges = useRecoilValue(filteredJudgesQuery)
  const actions = useJudgesActions()

  const columns: JudgeColDef[] = [
    {
      field: 'active',
      headerName: t('judgeActive'),
      renderCell: (params: GridRenderCellParams<Judge, Judge>) => <Switch checked={!!params.value} onChange={async (_e, checked) => {
        actions.save({...params.row, active: checked})
      }} />,
      width: 90,
    },
    {
      align: 'center',
      field: 'official',
      headerName: t('official'),
      renderCell: (params) => params.value ? <CheckBoxOutlined /> : <CheckBoxOutlineBlankOutlined />,
      width: 80,
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
      width: 80,
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
      headerName: 'Kennelpiiri',
    },
    {
      field: 'eventTypes',
      flex: 2,
      headerName: t('eventTypes'),
      valueGetter: (params) => params.row.eventTypes?.join(', '),
    },
    {
      field: 'languages',
      flex: 0,
      headerName: t('languages'),
      renderCell: (params: GridRenderCellParams<Judge, Judge>) =>
        <ToggleButtonGroup
          color={'info'}
          value={params.value}
          fullWidth
          onChange={(_e, value) => {
            actions.save({...params.row, languages: value})
          }}
        >
          <ToggleButton value="fi">{t('language.fi')}</ToggleButton>
          <ToggleButton value="sv">{t('language.sv')}</ToggleButton>
          <ToggleButton value="en">{t('language.en')}</ToggleButton>
        </ToggleButtonGroup>,
      width: 220,
    },
  ]

  const onChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) =>
    setSearchText(event.target.value), [setSearchText])

  const clearSearch = useCallback(() => setSearchText(''), [setSearchText])

  return (
    <>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<CloudSync />} onClick={actions.refresh}>{t('updateData', { data: 'judges' })}</Button>
        </Stack>

        <StyledDataGrid
          autoPageSize
          columns={columns}
          components={{ Toolbar: QuickSearchToolbar }}
          componentsProps={{
            toolbar: {
              value: searchText,
              onChange,
              clearSearch,
            },
          }}
          density='compact'
          disableColumnMenu
          disableVirtualization
          rows={judges}
        />
      </FullPageFlex>
    </>
  )
}
