import { Suspense, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import ManageAccountsOutlined from '@mui/icons-material/ManageAccountsOutlined'
import Menu from '@mui/icons-material/Menu'
import AppBar from '@mui/material/AppBar'
import IconButton from '@mui/material/IconButton'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { useRecoilValue } from 'recoil'

import logo from '../../assets/snj-logo.png'
import { hasAdminAccessSelector, idTokenAtom, userSelector, useUserActions } from '../recoil'

import AppBarButton from './header/AppBarButton'
import HelpMenu from './header/HelpMenu'
import LanguageMenu from './header/LanguageMenu'
import UserMenu from './header/UserMenu'

interface Props {
  readonly toggleMenu?: () => void
}

const Header = ({ toggleMenu }: Props) => {
  const actions = useUserActions()
  const navigate = useNavigate()
  const user = useRecoilValue(userSelector)
  const idToken = useRecoilValue(idTokenAtom)
  const hasAdminAccess = useRecoilValue(hasAdminAccessSelector)
  const inAdmin = !!toggleMenu

  const handleHomeClick = useCallback(() => navigate('/'), [navigate])
  const handleAdminClick = useCallback(() => navigate('/admin'), [navigate])

  useEffect(() => {
    if (idToken && !user) {
      // SignOut if fetching user information has failed for some reason
      actions.signOut()
    }
  }, [actions, idToken, user])

  return (
    <AppBar position="fixed" elevation={0}>
      <Toolbar variant="dense" disableGutters sx={{ width: '100%', px: 1, height: 36, minHeight: 36 }}>
        {toggleMenu ? (
          <IconButton color="secondary" sx={{ display: { sm: 'inline-flex', md: 'none' } }} onClick={toggleMenu}>
            <Menu />
          </IconButton>
        ) : null}
        <AppBarButton
          active={!inAdmin}
          startIcon={
            <img
              src={logo}
              height="28"
              alt="Suomen noutajakoirajärjestö"
              style={{ marginTop: '-4px', marginBottom: '-4px' }}
            />
          }
          onClick={handleHomeClick}
        >
          Koekalenteri
        </AppBarButton>
        {hasAdminAccess ? (
          <AppBarButton active={inAdmin} startIcon={<ManageAccountsOutlined />} onClick={handleAdminClick}>
            Ylläpito
          </AppBarButton>
        ) : null}
        <Typography
          variant="h6"
          color="#fdfdfd"
          noWrap
          component="div"
          sx={{ ml: 1, flexGrow: 1, flexShrink: 10000 }}
        ></Typography>
        <Suspense>
          <LanguageMenu />
          <UserMenu />
          <HelpMenu />
        </Suspense>
      </Toolbar>
    </AppBar>
  )
}

export default Header
