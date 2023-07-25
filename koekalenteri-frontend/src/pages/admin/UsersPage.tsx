import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AddCircleOutline from '@mui/icons-material/AddCircleOutline'
import EditOutlined from '@mui/icons-material/EditOutlined'
import StarsOutlined from '@mui/icons-material/StarsOutlined'
import Support from '@mui/icons-material/Support'
import { Theme, useMediaQuery } from '@mui/material'
import Badge from '@mui/material/Badge'
import Stack from '@mui/material/Stack'
import { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid'
import { User } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import StyledDataGrid from '../components/StyledDataGrid'
import { isOrgAdminSelector, userSelector } from '../recoil'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import AutoButton from './eventListPage/AutoButton'
import { adminUserFilterAtom, adminUserIdAtom, currentAdminUserSelector, filteredUsersSelector } from './recoil/user'
import { CreateUserDialog } from './usersPage/CreateUserDialog'
import { EditUserRolesDialog } from './usersPage/EditUserRolesDialog'

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
  const large = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const [searchText, setSearchText] = useRecoilState(adminUserFilterAtom)
  const { t } = useTranslation()
  const user = useRecoilValue(userSelector)
  const users = useRecoilValue(filteredUsersSelector)
  const isOrgAdmin = useRecoilValue(isOrgAdminSelector)
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
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value),
              clearSearch: () => setSearchText(''),
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
