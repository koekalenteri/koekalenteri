import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { useAuthenticator } from '@aws-amplify/ui-react'
import { ExpandMore, PersonOutline } from '@mui/icons-material'
import { Menu, MenuItem } from '@mui/material'

import { Path } from '../../../../routeConfig'
import AppBarButton from "../AppBarButton"


export default function LoggedInUserMenu() {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const { user, signOut } = useAuthenticator(context => [context.user])
  const { t } = useTranslation()
  const navigate = useNavigate()
  const open = Boolean(anchorEl)

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget), [setAnchorEl])
  const handleClose = useCallback(() => setAnchorEl(null), [setAnchorEl])
  const navigateToAdmin = useCallback(() => navigate(Path.admin.root), [navigate])

  return (
    <>
      <AppBarButton onClick={handleClick} startIcon={<PersonOutline />} endIcon={<ExpandMore />}>
        {user.attributes?.name || user.attributes?.email}
      </AppBarButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        onClick={handleClose}
      >
        <MenuItem onClick={navigateToAdmin}>{t('admin')}</MenuItem>
        <MenuItem onClick={signOut}>{t('logout')}</MenuItem>
      </Menu>

    </>
  )
}
