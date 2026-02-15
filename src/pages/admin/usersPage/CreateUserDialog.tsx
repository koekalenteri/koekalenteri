import type { Organizer } from '../../../types'
import Autocomplete from '@mui/material/Autocomplete'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useRecoilValue } from 'recoil'
import { adminUserAdminOrganizersSelector, useAdminUserActions } from '../recoil'

interface Props {
  readonly onClose: () => void
  readonly open: boolean
}

export function CreateUserDialog({ onClose, open }: Props) {
  const actions = useAdminUserActions()
  const { t } = useTranslation()
  const organizers = useRecoilValue(adminUserAdminOrganizersSelector)
  const [org, setOrg] = useState<Organizer | null>(organizers[0] ?? null)
  const [role, setRole] = useState<'admin' | 'secretary'>('secretary')
  const [email, setEmail] = useState<string>('')
  const [name, setName] = useState<string>('')

  const onSave = useCallback(() => {
    if (!org || !role) return
    actions
      .addUser({
        email,
        id: '',
        name,
        roles: { [org.id]: role },
      })
      .then(
        () => onClose(),
        (err) => console.error(err)
      )
  }, [actions, email, name, onClose, org, role])

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      open={open}
      onClose={onClose}
      aria-labelledby="create-user-dialog-title"
      aria-describedby="create-user-dialog-description"
    >
      <DialogTitle id="create-user-dialog-title">{t('user.createDialog.title')}</DialogTitle>
      <DialogContent>
        <Box
          component="form"
          sx={{
            '& .MuiTextField-root': { m: 1, width: '100%' },
          }}
          noValidate
          autoComplete="off"
        >
          <Autocomplete
            disabled={organizers.length === 1}
            value={org}
            getOptionLabel={(org) => org.name}
            renderOption={(props, option) => {
              return (
                <li {...props} key={option.id}>
                  {option.name}
                </li>
              )
            }}
            options={organizers}
            onChange={(_event, value) => setOrg(value)}
            renderInput={(params) => <TextField {...params} label={t('user.createDialog.organization')} />}
          />

          <TextField
            select
            value={role}
            onChange={(event) => setRole(event.target.value as 'admin' | 'secretary')}
            label={t('user.createDialog.role')}
          >
            <MenuItem value="admin">{t('user.roles.admin')}</MenuItem>
            <MenuItem value="secretary">{t('user.roles.secretary')}</MenuItem>
          </TextField>
          <TextField
            label={t('user.createDialog.email')}
            onChange={(event) => setEmail(event.target.value)}
          ></TextField>
          <TextField label={t('user.createDialog.name')} onChange={(event) => setName(event.target.value)}></TextField>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onSave} variant="contained" disabled={!org || !role || !email || !name}>
          {t('user.createDialog.cta')}
        </Button>
        <Button onClick={onClose} variant="outlined">
          {t('cancel')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
