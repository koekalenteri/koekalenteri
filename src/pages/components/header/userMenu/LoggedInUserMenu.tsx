import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ExpandMore from '@mui/icons-material/ExpandMore'
import PersonOutline from '@mui/icons-material/PersonOutline'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import TextField from '@mui/material/TextField'

import { useUserActions } from '../../../recoil/user/actions'
import AppBarButton from '../AppBarButton'

interface Props {
  readonly userName: string
}

export default function LoggedInUserMenu({ userName }: Props) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const [editOpen, setEditOpen] = useState(false)
  const { t } = useTranslation()
  const actions = useUserActions()

  const [nameDraft, setNameDraft] = useState(userName)

  const openEdit = useCallback(() => {
    setNameDraft(userName)
    setEditOpen(true)
  }, [userName])

  const closeEdit = useCallback(() => setEditOpen(false), [])

  const saveDisabled = useMemo(() => {
    const cleaned = String(nameDraft ?? '').trim()
    return !cleaned || cleaned === String(userName ?? '').trim()
  }, [nameDraft, userName])

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget),
    [setAnchorEl]
  )
  const handleClose = useCallback(() => setAnchorEl(null), [setAnchorEl])

  return (
    <>
      <AppBarButton onClick={handleClick} startIcon={<PersonOutline />} endIcon={<ExpandMore />} label="user">
        {userName}
      </AppBarButton>
      <Menu
        anchorEl={anchorEl}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        open={!!anchorEl}
        onClose={handleClose}
        onClick={handleClose}
      >
        <MenuItem onClick={openEdit}>{t('user.editName')}</MenuItem>
        <MenuItem onClick={async () => actions.signOut()}>{t('logout')}</MenuItem>
      </Menu>

      <Dialog open={editOpen} onClose={closeEdit} fullWidth maxWidth="xs">
        <DialogTitle>{t('user.editNameDialog.title')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            margin="dense"
            label={t('user.editNameDialog.name')}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeEdit} variant="outlined">
            {t('cancel')}
          </Button>
          <Button
            onClick={async () => {
              await actions.updateOwnName(String(nameDraft ?? '').trim())
              closeEdit()
            }}
            variant="contained"
            disabled={saveDisabled}
          >
            {t('save')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
