import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CloudSync } from '@mui/icons-material'
import { Button, Stack } from '@mui/material'
import { GridColumns } from '@mui/x-data-grid'
import { Organizer } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import StyledDataGrid from '../components/StyledDataGrid'
import { isAdminSelector } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import { filteredOrganizersSelector, organizerFilterAtom, useOrganizersActions } from './recoil'

export default function OrganizerListPage() {
  const [searchText, setSearchText] = useRecoilState(organizerFilterAtom)
  const organizers = useRecoilValue(filteredOrganizersSelector)
  const isAdmin = useRecoilValue(isAdminSelector)
  const actions = useOrganizersActions()

  const { t } = useTranslation()

  const columns: GridColumns<Organizer> = [
    {
      field: 'kcId',
      flex: 1,
      headerName: t('organizer.kcId'),
    },
    {
      field: 'name',
      headerName: t('organizer.name'),
      flex: 3,
    },
  ]

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value),
    [setSearchText]
  )

  const clearSearch = useCallback(() => setSearchText(''), [setSearchText])

  return (
    <>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <Button startIcon={<CloudSync />} onClick={actions.refresh} sx={{ display: isAdmin ? undefined : 'none' }}>
            {t('updateData', { data: 'organizations' })}
          </Button>
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
