import type { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid'
import type { Organizer } from '../../types'
import CloudSync from '@mui/icons-material/CloudSync'
import EditOutlined from '@mui/icons-material/EditOutlined'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Switch from '@mui/material/Switch'
import { useAtom, useAtomValue } from 'jotai'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { localeSortComparator } from '../../lib/datagrid'
import StyledDataGrid from '../components/StyledDataGrid'
import { isAdminAtom } from '../state'
import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import AutoButton from './eventListPage/AutoButton'
import { EditOrganizerDialog } from './organizerListPage/EditOrganizerDialog'
import {
  adminCurrentOrganizerAtom,
  adminFilteredOrganizersAtom,
  adminOrganizerColumnsAtom,
  adminOrganizerFilterAtom,
  adminOrganizerIdAtom,
  adminShowOnlyOrganizersWithUsersAtom,
  useAdminOrganizersActions,
} from './state'

export default function OrganizerListPage() {
  const [searchText, setSearchText] = useAtom(adminOrganizerFilterAtom)
  const [selectedID, setSelectedID] = useAtom(adminOrganizerIdAtom)
  const [visibilityModel, setVisibilityModel] = useAtom(adminOrganizerColumnsAtom)
  const [showWithUsers, setShowWithUsers] = useAtom(adminShowOnlyOrganizersWithUsersAtom)
  const organizers = useAtomValue(adminFilteredOrganizersAtom)
  const isAdmin = useAtomValue(isAdminAtom)
  const selectedOrganizer = useAtomValue(adminCurrentOrganizerAtom)
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
      flex: 3,
      headerName: t('organizer.name'),
      sortComparator: localeSortComparator,
    },
    {
      field: 'paytrailMerchantId',
      flex: 3,
      headerName: t('organizer.paytrailMerchantId'),
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
          autoPageSize
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
              clearSearch,
              columnSelector: true,
              onChange,
              value: searchText,
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
