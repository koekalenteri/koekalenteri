import { useTranslation } from 'react-i18next'
import { CloudSync } from '@mui/icons-material'
import { Button, Stack } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import { Organizer } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import { QuickSearchToolbar, StyledDataGrid } from '../../components'
import { filteredOrganizersQuery, organizerFilterAtom, useOrganizersActions } from '../recoil/organizers'

import FullPageFlex from './components/FullPageFlex'

interface OrganizerColDef extends GridColDef {
  field: keyof Organizer
}

export const OrganizerListPage = () => {
  const [searchText, setSearchText] = useRecoilState(organizerFilterAtom)
  const organizers = useRecoilValue(filteredOrganizersQuery)
  const actions = useOrganizersActions()

  const { t } = useTranslation()

  const columns: OrganizerColDef[] = [
    {
      field: 'id',
      headerName: t('id'),
    },
    {
      field: 'name',
      headerName: t('name'),
      flex: 2,
    },
  ]

  return (
    <>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<CloudSync />} onClick={actions.refresh}>{t('updateData', { data: 'organizations' })}</Button>
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
          disableVirtualization
          rows={organizers}
        />
      </FullPageFlex>
    </>
  )
}
