import type { SelectChangeEvent } from '@mui/material/Select'
import type { Organizer, User } from '../../../types'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Checkbox from '@mui/material/Checkbox'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import FormControlLabel from '@mui/material/FormControlLabel'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableFooter from '@mui/material/TableFooter'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import TextField from '@mui/material/TextField'
import { useRecoilValue } from 'recoil'

import { isAdminSelector } from '../../recoil'
import { adminUserAdminOrganizersSelector, useAdminUserActions } from '../recoil/user'

interface Props {
  readonly user: User | null | undefined
  readonly onClose: () => void
  readonly open: boolean
}

export function EditUserRolesDialog({ onClose, open, user }: Props) {
  const { t } = useTranslation()
  const actions = useAdminUserActions()
  const isAdmin = useRecoilValue(isAdminSelector)
  const organizers = useRecoilValue(adminUserAdminOrganizersSelector)
  const [org, setOrg] = useState<Organizer | null>(null)
  const [role, setRole] = useState<'admin' | 'secretary'>('secretary')
  const roles = user?.roles ?? {}
  const availableOrgs = organizers.filter((org) => !Object.keys(roles).includes(org.id))

  const handleRoleChange = useCallback((event: SelectChangeEvent<'admin' | 'secretary'>) => {
    setRole(event.target.value)
  }, [])

  const handleAdminChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user) return
    await actions.setAdmin({ ...user, admin: event.target.checked })
  }

  useEffect(() => {
    if (org && !availableOrgs.some((o) => o.id === org.id)) {
      setOrg(null)
    }
  }, [org, availableOrgs])

  if (!user) {
    return null
  }

  return (
    <Dialog
      fullWidth
      maxWidth="lg"
      open={open}
      onClose={onClose}
      aria-labelledby="edit-roles-dialog-title"
      aria-describedby="edit-roles-dialog-description"
    >
      <DialogTitle id="edit-roles-dialog-title">{t('user.editRolesDialog.title', { user })}</DialogTitle>
      <DialogContent>
        <FormControlLabel
          disabled={!isAdmin}
          control={<Checkbox checked={!!user.admin} onChange={handleAdminChange} />}
          label={t('user.admin')}
          name="isAdmin"
        />
        {user.admin ? (
          <DialogContentText variant="h6">{t('user.adminRoles')}</DialogContentText>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ width: '60%' }}>Yhdistys</TableCell>
                <TableCell>Rooli</TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.keys(roles).map((orgId) => {
                const o = organizers.find((o) => o.id === orgId)
                return (
                  <TableRow key={orgId}>
                    <TableCell>{o?.name ?? `(tuntematon/poistettu yhdistys: ${orgId})`}</TableCell>
                    <TableCell>{t(`user.roles.${roles[orgId]}`)}</TableCell>
                    <TableCell>
                      <Button variant="outlined" onClick={() => actions.removeRole(user, orgId)}>
                        Poista
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>
                  <Autocomplete
                    value={org}
                    getOptionLabel={(org) => org.name}
                    renderOption={(props, option) => {
                      return (
                        <li {...props} key={option.id}>
                          {option.name}
                        </li>
                      )
                    }}
                    options={availableOrgs ?? []}
                    onChange={(_event, value) => setOrg(value)}
                    renderInput={(params) => <TextField {...params} />}
                  />
                </TableCell>
                <TableCell>
                  <Select value={role} onChange={handleRoleChange}>
                    <MenuItem value="admin">{t('user.roles.admin')}</MenuItem>
                    <MenuItem value="secretary">{t('user.roles.secretary')}</MenuItem>
                  </Select>
                </TableCell>
                <TableCell>
                  <Button
                    disabled={!org}
                    onClick={() => org && actions.addRole(user, org.id, role)}
                    variant="contained"
                  >
                    Lisää
                  </Button>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="outlined">
          {t('close')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
