import { useTranslation } from 'react-i18next'
import { CloudSync } from '@mui/icons-material'
import { Button, Stack, Theme, useMediaQuery } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import { Official } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import StyledDataGrid from '../components/StyledDataGrid'
import { filteredOfficialsQuery, officialFilterAtom, useJudgesActions } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'

interface OfficialColDef extends GridColDef {
  field: keyof Official
}

export const OfficialListPage = () => {
  const large = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const [searchText, setSearchText] = useRecoilState(officialFilterAtom)
  const { t } = useTranslation()
  const officials = useRecoilValue(filteredOfficialsQuery)
  const actions = useJudgesActions()

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
      width: 80,
    },
    {
      field: 'location',
      flex: 0,
      headerName: t('contact.city'),
      width: 120,
    },
    {
      field: 'phone',
      flex: 0,
      headerName: t('contact.phone'),
      width: 150,
    },
    {
      field: 'email',
      flex: 1,
      headerName: t('contact.email'),
      minWidth: 150,
    },
    {
      field: 'district',
      flex: 1,
      headerName: t('district'),
    },
    {
      field: 'eventTypes',
      flex: 1,
      headerName: t('eventTypes'),
      valueGetter: (params) => params.row.eventTypes?.join(', '),
    },
  ]

  return (
    <>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<CloudSync />} onClick={actions.refresh}>{t('updateData', { data: 'officials' })}</Button>
        </Stack>

        <StyledDataGrid
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
                setSearchText(event.target.value),
              clearSearch: () => setSearchText(''),
            },
          }}
          rows={officials}
        />
      </FullPageFlex>
    </>
  )
}
