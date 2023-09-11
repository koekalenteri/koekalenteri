import type { GridColDef } from '@mui/x-data-grid'
import type { Organizer } from 'koekalenteri-shared/model'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import CloudSync from '@mui/icons-material/CloudSync'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import { useRecoilState, useRecoilValue } from 'recoil'

import StyledDataGrid from '../components/StyledDataGrid'
import { isAdminSelector } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import { adminOrganizerFilterAtom, filteredOrganizersSelector, useOrganizersActions } from './recoil'

export default function OrganizerListPage() {
  const [searchText, setSearchText] = useRecoilState(adminOrganizerFilterAtom)
  const organizers = useRecoilValue(filteredOrganizersSelector)
  const isAdmin = useRecoilValue(isAdminSelector)
  const actions = useOrganizersActions()

  const { t } = useTranslation()

  const columns: GridColDef<Organizer>[] = [
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
          slots={{ toolbar: QuickSearchToolbar }}
          slotProps={{
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
