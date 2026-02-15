import ManageAccountsOutlined from '@mui/icons-material/ManageAccountsOutlined'
import Menu from '@mui/icons-material/Menu'
import AppBar from '@mui/material/AppBar'
import IconButton from '@mui/material/IconButton'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { Suspense, useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { useRecoilValue } from 'recoil'
import logo from '../../assets/snj-logo.png'
import { Path } from '../../routeConfig'
import { hasAdminAccessSelector, idTokenAtom, userSelector, useUserActions } from '../recoil'
import AppBarButton from './header/AppBarButton'
import HelpMenu from './header/HelpMenu'
import LanguageMenu from './header/LanguageMenu'
import UserMenu from './header/UserMenu'

interface Props {
  readonly toggleMenu?: () => void
}

const Header = ({ toggleMenu }: Props) => {
  const { t } = useTranslation()
  const actions = useUserActions()
  const navigate = useNavigate()
  const user = useRecoilValue(userSelector)
  const idToken = useRecoilValue(idTokenAtom)
  const hasAdminAccess = useRecoilValue(hasAdminAccessSelector)
  const inAdmin = !!toggleMenu

  const handleHomeClick = useCallback(() => navigate(Path.home), [navigate])
  const handleAdminClick = useCallback(() => navigate(Path.admin.root), [navigate])

  useEffect(() => {
    if (idToken && !user) {
      // SignOut if fetching user information has failed for some reason
      actions.signOut(false)
    }
  }, [actions, idToken, user])

  return (
    <AppBar position="fixed" elevation={0}>
      <Toolbar variant="dense" disableGutters sx={{ height: 36, minHeight: 36, px: 1, width: '100%' }}>
        {toggleMenu ? (
          <IconButton color="secondary" sx={{ display: { md: 'none', sm: 'inline-flex' } }} onClick={toggleMenu}>
            <Menu />
          </IconButton>
        ) : null}
        <AppBarButton
          active={hasAdminAccess && !inAdmin}
          startIcon={
            <img
              src={logo}
              width="20"
              height="28"
              alt="Suomen noutajakoirajärjestö"
              style={{ marginBottom: '-4px', marginTop: '-4px' }}
            />
          }
          label="home"
          onClick={handleHomeClick}
        >
          Koekalenteri
        </AppBarButton>
        {hasAdminAccess ? (
          <AppBarButton
            active={inAdmin}
            startIcon={<ManageAccountsOutlined />}
            onClick={handleAdminClick}
            label="admin"
          >
            {t('admin')}
          </AppBarButton>
        ) : null}
        <Typography
          variant="h6"
          color="#fdfdfd"
          noWrap
          component="div"
          sx={{ flexGrow: 1, flexShrink: 10000, ml: 1 }}
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
