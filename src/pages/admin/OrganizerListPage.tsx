import type { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid'
import type { Organizer } from '../../types'

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import CloudSync from '@mui/icons-material/CloudSync'
import EditOutlined from '@mui/icons-material/EditOutlined'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import { useRecoilState, useRecoilValue } from 'recoil'

import StyledDataGrid from '../components/StyledDataGrid'
import { isAdminSelector } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import AutoButton from './eventListPage/AutoButton'
import { EditOrganizerDialog } from './organizerListPage/EditOrganizerDialog'
import {
  adminCurrentOrganizerSelector,
  adminFilteredOrganizersSelector,
  adminOrganizerColumnsAtom,
  adminOrganizerFilterAtom,
  adminOrganizerIdAtom,
  adminShowOnlyOrganizersWithUsersAtom,
  useAdminOrganizersActions,
} from './recoil'

export default function OrganizerListPage() {
  const [searchText, setSearchText] = useRecoilState(adminOrganizerFilterAtom)
  const [selectedID, setSelectedID] = useRecoilState(adminOrganizerIdAtom)
  const [visibilityModel, setVisibilityModel] = useRecoilState(adminOrganizerColumnsAtom)
  const [showWithUsers, setShowWithUsers] = useRecoilState(adminShowOnlyOrganizersWithUsersAtom)
  const organizers = useRecoilValue(adminFilteredOrganizersSelector)
  const isAdmin = useRecoilValue(isAdminSelector)
  const selectedOrganizer = useRecoilValue(adminCurrentOrganizerSelector)
  const actions = useAdminOrganizersActions()
  const [editOpen, setEditOpen] = useState(false)

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
  const toggleShowWithUsers = useCallback(
    (_event: React.SyntheticEvent<Element, Event>, checked: boolean) => setShowWithUsers(checked),
    [setShowWithUsers]
  )

  const handleSelectionModeChange = useCallback(
    (selection: GridRowSelectionModel) => {
      const value = typeof selection[0] === 'string' ? selection[0] : undefined
      setSelectedID(value)
    },
    [setSelectedID]
  )
  const handleSave = useCallback(
    async (organizer: Organizer) => {
      await actions.save(organizer)
      setEditOpen(false)
    },
    [actions]
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
          <AutoButton
            disabled={!selectedID}
            startIcon={<EditOutlined />}
            text={t('editWhat', { what: t('organizer.editWhat') })}
            onClick={() => setEditOpen(true)}
          />
        </Stack>

        <StyledDataGrid
          columns={columns}
          columnVisibilityModel={visibilityModel}
          onColumnVisibilityModelChange={setVisibilityModel}
          onRowDoubleClick={() => setEditOpen(true)}
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
              children: (
                <Stack direction="row" mx={1} flex={1}>
                  <FormControlLabel
                    sx={{ m: 0, pl: 1 }}
                    checked={showWithUsers}
                    control={<Switch size="small" />}
                    label="Näytä vain yhdistykset, joilla on käyttäjiä"
                    labelPlacement="start"
                    name="showWithUsers"
                    onChange={toggleShowWithUsers}
                  />
                </Stack>
              ),
            },
          }}
        />
      </FullPageFlex>
      <EditOrganizerDialog
        onClose={() => setEditOpen(false)}
        onSave={handleSave}
        open={editOpen}
        organizer={selectedOrganizer}
      />
    </>
  )
}
