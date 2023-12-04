import type { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid'
import type { User } from '../../types'

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AddCircleOutline from '@mui/icons-material/AddCircleOutline'
import EditOutlined from '@mui/icons-material/EditOutlined'
import StarsOutlined from '@mui/icons-material/StarsOutlined'
import Support from '@mui/icons-material/Support'
import Badge from '@mui/material/Badge'
import Stack from '@mui/material/Stack'
import { useRecoilState, useRecoilValue } from 'recoil'

import AutocompleteSingle from '../components/AutocompleteSingle'
import StyledDataGrid from '../components/StyledDataGrid'
import { isOrgAdminSelector, userSelector } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import AutoButton from './eventListPage/AutoButton'
import { CreateUserDialog } from './usersPage/CreateUserDialog'
import { EditUserRolesDialog } from './usersPage/EditUserRolesDialog'
import {
  adminUserFilterAtom,
  adminUserIdAtom,
  adminUsersColumnsAtom,
  adminUsersOrganizerIdAtom,
  adminUsersOrganizersSelector,
  currentAdminUserSelector,
  filteredUsersSelector,
} from './recoil'

const RoleInfo = ({ admin, roles }: User) => {
  if (admin) {
    return <StarsOutlined />
  }
  const roleCount = Object.keys(roles ?? {}).length
  if (roleCount) {
    return (
      <Badge badgeContent={roleCount}>
        <Support fontSize="small" />
      </Badge>
    )
  }

  return null
}

export default function UsersPage() {
  const [searchText, setSearchText] = useRecoilState(adminUserFilterAtom)
  const { t } = useTranslation()

  const [visibilityModel, setVisibilityModel] = useRecoilState(adminUsersColumnsAtom)

  const user = useRecoilValue(userSelector)
  const isOrgAdmin = useRecoilValue(isOrgAdminSelector)
  const orgs = useRecoilValue(adminUsersOrganizersSelector)
  const [orgId, setOrgId] = useRecoilState(adminUsersOrganizerIdAtom)
  const options = useMemo(() => [{ id: '', name: 'Kaikki' }, ...orgs], [orgs])
  const users = useRecoilValue(filteredUsersSelector)

  const [selectedUserID, setSelectedUserID] = useRecoilState(adminUserIdAtom)
  const selectedUser = useRecoilValue(currentAdminUserSelector)
  const [createOpen, setCreateOpen] = useState(false)
  const [rolesOpen, setRolesOpen] = useState(false)

  const columns: GridColDef<User>[] = [
    {
      field: 'name',
      flex: 1,
      headerName: t('name'),
    },
    {
      field: 'roles',
      flex: 0,
      headerName: t('roles'),
      width: 80,
      sortComparator: (a, b) => {
        const admin = a.admin - b.admin
        return admin === 0 ? Object.keys(a.roles).length - Object.keys(b.roles).length : admin
      },
      valueGetter: (params) => ({ admin: params.row.admin ?? false, roles: params.row.roles ?? {} }),
      renderCell: ({ value }) => <RoleInfo {...value} />,
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
  ]

  const createAction = useCallback(() => setCreateOpen(true), [])
  const editAction = useCallback(() => setRolesOpen(true), [])
  const handleSelectionModeChange = useCallback(
    (selection: GridRowSelectionModel) => {
      const value = typeof selection[0] === 'string' ? selection[0] : undefined
      setSelectedUserID(value)
    },
    [setSelectedUserID]
  )

  return (
    <>
      <FullPageFlex>
        <Stack direction="row" spacing={2}>
          <AutoButton
            disabled={!isOrgAdmin}
            startIcon={<AddCircleOutline />}
            onClick={createAction}
            text={t('create')}
          />
          <AutoButton
            disabled={!isOrgAdmin || !selectedUserID || selectedUserID === user?.id}
            startIcon={<EditOutlined />}
            onClick={editAction}
            text={t('editRoles')}
          />
        </Stack>
        <StyledDataGrid
          columns={columns}
          columnVisibilityModel={visibilityModel}
          onColumnVisibilityModelChange={setVisibilityModel}
          slots={{ toolbar: QuickSearchToolbar }}
          slotProps={{
            toolbar: {
              value: searchText,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value),
              clearSearch: () => setSearchText(''),
              columnSelector: true,
              children: (
                <Stack direction="row" mx={1} flex={1}>
                  <AutocompleteSingle
                    disabled={orgs.length < 2}
                    size="small"
                    options={options}
                    label={'Yhdistys'}
                    getOptionLabel={(o) => o.name}
                    renderOption={(props, option) => {
                      return (
                        <li {...props} key={option.id}>
                          {option.name}
                        </li>
                      )
                    }}
                    value={options.find((o) => o.id === orgId) ?? null}
                    onChange={(o) => setOrgId(o?.id ?? '')}
                  />
                </Stack>
              ),
            },
          }}
          rowHeight={50}
          rows={users}
          onRowSelectionModelChange={handleSelectionModeChange}
          rowSelectionModel={selectedUserID ? [selectedUserID] : []}
        />
      </FullPageFlex>
      <CreateUserDialog onClose={() => setCreateOpen(false)} open={createOpen} />
      <EditUserRolesDialog user={selectedUser} onClose={() => setRolesOpen(false)} open={rolesOpen} />
    </>
  )
}
