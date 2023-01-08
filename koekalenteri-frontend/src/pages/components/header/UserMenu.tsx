import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuthenticator } from '@aws-amplify/ui-react'
import { ExpandMore, PersonOutline } from '@mui/icons-material'
import { Menu, MenuItem } from '@mui/material'

import { AppBarButton } from '../../../components/Buttons'
import { Path } from '../../../routeConfig'
import { useSessionBoolean } from '../../../stores'


export function UserMenu() {
  const { route } = useAuthenticator(context => [context.route])
  const [greeted] = useSessionBoolean('greeted', false)
  const location = useLocation()

  if (route === 'idle' && greeted) {
    return <Navigate to={Path.login} state={{ from: location }} replace />
  }

  return route === 'authenticated' ? <LoggedInUserMenu /> : <LoginButton />
}

function LoginButton() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const navigateToLogin = useCallback(() => navigate(Path.login, {state: {from: location}}), [location, navigate])

  return (
    <>
      <AppBarButton onClick={navigateToLogin} startIcon={<PersonOutline />}>
        {t(`login`)}
      </AppBarButton>
    </>
  )
}

function LoggedInUserMenu() {
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
