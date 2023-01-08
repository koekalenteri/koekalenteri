import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudSync } from '@mui/icons-material'
import { Button, Stack } from '@mui/material'
import { GridColDef } from '@mui/x-data-grid'
import { Organizer } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import StyledDataGrid from '../components/StyledDataGrid'
import { filteredOrganizersQuery, organizerFilterAtom, useOrganizersActions } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'

interface OrganizerColDef extends GridColDef {
  field: keyof Organizer
}

export default function OrganizerListPage() {
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

  const onChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) =>
    setSearchText(event.target.value), [setSearchText])

  const clearSearch = useCallback(() => setSearchText(''), [setSearchText])

  return (
    <>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<CloudSync />} onClick={actions.refresh}>{t('updateData', { data: 'organizations' })}</Button>
        </Stack>

        <StyledDataGrid
          columns={columns}
          components={{ Toolbar: QuickSearchToolbar }}
          componentsProps={{
            toolbar: {
              value: searchText,
              onChange,
              clearSearch,
            },
          }}
          rows={organizers}
        />
      </FullPageFlex>
    </>
  )
}
