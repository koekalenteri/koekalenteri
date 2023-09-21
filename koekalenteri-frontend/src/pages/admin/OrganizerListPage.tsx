import type { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid'
import type { Organizer } from 'koekalenteri-shared/model'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import CloudSync from '@mui/icons-material/CloudSync'
import EditOutlined from '@mui/icons-material/EditOutlined'
import Stack from '@mui/material/Stack'
import { useRecoilState, useRecoilValue } from 'recoil'

import StyledDataGrid from '../components/StyledDataGrid'
import { isAdminSelector } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import AutoButton from './eventListPage/AutoButton'
import {
  adminOrganizerColumnsAtom,
  adminOrganizerFilterAtom,
  adminOrganizerIdAtom,
  filteredOrganizersSelector,
  useOrganizersActions,
} from './recoil'

export default function OrganizerListPage() {
  const [searchText, setSearchText] = useRecoilState(adminOrganizerFilterAtom)
  const [selectedID, setSelectedID] = useRecoilState(adminOrganizerIdAtom)
  const [visibilityModel, setVisibilityModel] = useRecoilState(adminOrganizerColumnsAtom)
  const organizers = useRecoilValue(filteredOrganizersSelector)
  const isAdmin = useRecoilValue(isAdminSelector)
  const actions = useOrganizersActions()

  const { t } = useTranslation()

  const columns: GridColDef<Organizer>[] = [
    {
      field: 'id',
      flex: 1,
      headerName: t('organizer.id'),
    },
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
    {
      field: 'paytrailMerchantId',
      headerName: t('organizer.paytrailMerchantId'),
      flex: 3,
    },
  ]

  const onChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value),
    [setSearchText]
  )

  const clearSearch = useCallback(() => setSearchText(''), [setSearchText])
  const handleSelectionModeChange = useCallback(
    (selection: GridRowSelectionModel) => {
      const value = typeof selection[0] === 'string' ? selection[0] : undefined
      setSelectedID(value === selectedID ? undefined : value)
    },
    [selectedID, setSelectedID]
  )
  return (
    <>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <AutoButton
            startIcon={<CloudSync />}
            onClick={actions.refresh}
            sx={{ display: isAdmin ? undefined : 'none' }}
            text={t('updateData', { data: 'organizations' })}
          />
          <AutoButton disabled={!selectedID} startIcon={<EditOutlined />} text={t('edit')} />
        </Stack>

        <StyledDataGrid
          columns={columns}
          columnVisibilityModel={visibilityModel}
          onColumnVisibilityModelChange={setVisibilityModel}
          onRowSelectionModelChange={handleSelectionModeChange}
          rows={organizers}
          rowSelectionModel={selectedID ? [selectedID] : []}
          slots={{ toolbar: QuickSearchToolbar }}
          slotProps={{
            toolbar: {
              value: searchText,
              columnSelector: true,
              onChange,
              clearSearch,
            },
          }}
        />
      </FullPageFlex>
    </>
  )
}
