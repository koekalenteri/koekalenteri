import { useTranslation } from 'react-i18next'
import { CheckBoxOutlineBlankOutlined, CheckBoxOutlined, CloudSync } from '@mui/icons-material'
import { Button, Stack, Switch } from '@mui/material'
import { GridColDef, GridRenderCellParams } from '@mui/x-data-grid'
import { EventType } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import { QuickSearchToolbar, StyledDataGrid } from '../../components'
import { eventTypeFilterAtom, filteredEventTypesQuery, useEventTypeActions } from '../recoil/eventTypes'

import FullPageFlex from './components/FullPageFlex'

interface EventTypeColDef extends GridColDef {
  field: keyof EventType
}

export const EventTypeListPage = () =>  {
  const [searchText, setSearchText] = useRecoilState(eventTypeFilterAtom)
  const eventTypes = useRecoilValue(filteredEventTypesQuery)
  const actions = useEventTypeActions()
  const { t, i18n } = useTranslation()
  const columns: EventTypeColDef[] = [
    {
      field: 'eventType',
      headerName: t('eventType', { context: 'short' }),
    },
    {
      align: 'center',
      field: 'official',
      headerName: t('official'),
      renderCell: (params) => params.value ? <CheckBoxOutlined /> : <CheckBoxOutlineBlankOutlined />,
      width: 80,
    },
    {
      field: 'active',
      headerName: t('active'),
      renderCell: (params: GridRenderCellParams<EventType, EventType>) => <Switch checked={!!params.value} onChange={async (_e, checked) => {
        actions.save({...params.row, active: checked})
      }} />,
      width: 80,
    },
    {
      field: 'description',
      headerName: t('eventType'),
      flex: 1,
      valueGetter: (params) => params.value[i18n.language],
    },
  ]

  return (
    <>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<CloudSync />} onClick={actions.refresh}>{t('updateData', {data: 'eventTypes'})}</Button>
        </Stack>

        <StyledDataGrid
          autoPageSize
          columns={columns}
          components={{ Toolbar: QuickSearchToolbar }}
          componentsProps={{
            toolbar: {
              value: searchText,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                setSearchText(event.target.value),
              clearSearch: () => setSearchText(''),
            },
          }}
          density='compact'
          disableColumnMenu
          rows={eventTypes}
          getRowId={(row) => row.eventType}
        />
      </FullPageFlex>
    </>
  )
}
