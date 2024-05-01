import type { TooltipProps } from '@mui/material/Tooltip'
import type { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid'
import type { User } from '../../types'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Accessibility from '@mui/icons-material/Accessibility'
import AddCircleOutline from '@mui/icons-material/AddCircleOutline'
import EditOutlined from '@mui/icons-material/EditOutlined'
import StarsOutlined from '@mui/icons-material/StarsOutlined'
import SupervisorAccount from '@mui/icons-material/SupervisorAccount'
import Support from '@mui/icons-material/Support'
import Badge from '@mui/material/Badge'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { styled } from '@mui/material/styles'
import Tooltip, { tooltipClasses } from '@mui/material/Tooltip'
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
  filteredAdminUsersSelector,
} from './recoil'

const IconPlaceholder = () => <StarsOutlined sx={{ color: 'transparent' }} fontSize="small" />

const RolesTooltip = styled(({ className, ...props }: TooltipProps) => (
  <Tooltip {...props} classes={{ popper: className }} />
))({
  [`& .${tooltipClasses.tooltip}`]: {
    maxWidth: 'none',
  },
})

const RolesTooltipContent = ({ roles }: { roles: string }) => <Box sx={{ whiteSpace: 'pre-line' }}>{roles}</Box>

const RoleInfo = ({ admin, judge, officer, roles }: User) => {
  const { t } = useTranslation()
  const orgs = useRecoilValue(adminUsersOrganizersSelector)
  const roleStrings: string[] = []
  const orgRoleCount = roles ? Object.keys(roles).length : 0

  if (admin) roleStrings.push('Koekalenterin pääkäyttäjä')

  if (roles) {
    Object.keys(roles).forEach((orgId) => {
      const org = orgs.find((o) => o.id === orgId)
      const role = t(`user.roles.${roles[orgId]}`)
      roleStrings.push(`${role} - ${org?.name}`)
    })
  }

  if (judge) roleStrings.push(`Tuomari - ${judge.join(', ')}`)
  if (officer) roleStrings.push(`Koetoimitsija - ${officer.join(', ')}`)

  return (
    <RolesTooltip placement="right" title={<RolesTooltipContent roles={roleStrings.join('\n')} />}>
      <Stack direction="row" alignItems="center">
        {admin ? (
          <StarsOutlined fontSize="small" />
        ) : orgRoleCount ? (
          <Badge badgeContent={orgRoleCount}>
            <Support fontSize="small" />
          </Badge>
        ) : (
          <IconPlaceholder />
        )}
        {judge ? <Accessibility fontSize="small" /> : <IconPlaceholder />}
        {officer ? <SupervisorAccount fontSize="small" /> : <IconPlaceholder />}
      </Stack>
    </RolesTooltip>
  )
}

export default function UsersPage() {
  const [searchText, setSearchText] = useRecoilState(adminUserFilterAtom)
  const { t } = useTranslation()

  const [visibilityModel, setVisibilityModel] = useRecoilState(adminUsersColumnsAtom)

  const user = useRecoilValue(userSelector)
  const isOrgAdmin = useRecoilValue(isOrgAdminSelector)
  const orgs = useRecoilValue(adminUsersOrganizersSelector)
  const [orgId, setOrgId] = useRecoilState(adminUsersOrganizerIdAtom)
  const options = useMemo(() => {
    const userOrgs = user?.admin ? orgs : orgs.filter((o) => user?.roles?.[o.id])
    if (userOrgs.length === 1) {
      return userOrgs
    }
    return [{ id: '', name: 'Kaikki' }, ...userOrgs]
  }, [orgs, user?.admin, user?.roles])
  const users = useRecoilValue(filteredAdminUsersSelector)

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
      display: 'flex',
      width: 90,
      sortComparator: (a, b) => {
        const admin = a.admin - b.admin
        return admin === 0 ? Object.keys(a.roles).length - Object.keys(b.roles).length : admin
      },
      valueGetter: (_value, row) => ({ admin: false, roles: {}, ...row }),
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
      flex: 2,
      headerName: t('contact.email'),
      minWidth: 150,
    },
    {
      field: 'district',
      flex: 1,
      headerName: t('district'),
    },
    {
      field: 'lastSeen',
      minWidth: 150,
      flex: 1,
      headerName: t('user.lastSeen'),
      valueFormatter: (value: User['lastSeen']) => t('dateFormat.long', { date: value }),
      align: 'center',
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

  useEffect(() => {
    if (options.length === 1 && orgId !== options[0].id) {
      setOrgId(options[0].id)
    }
  }, [options, orgId, setOrgId])

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
                    disabled={options.length < 2}
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
