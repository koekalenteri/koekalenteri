import { Suspense, useEffect } from 'react'
import { Link as SpaLink } from 'react-router-dom'
import Menu from '@mui/icons-material/Menu'
import AppBar from '@mui/material/AppBar'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { useRecoilValue } from 'recoil'

import logo from '../../assets/snj-logo.png'
import { hasAdminAccessSelector, idTokenAtom, userSelector, useUserActions } from '../recoil'

import { AdminLink } from './header/AdminLink'
import LanguageMenu from './header/LanguageMenu'
import UserMenu from './header/UserMenu'

interface Props {
  readonly toggleMenu?: () => void
}

const Header = ({ toggleMenu }: Props) => {
  const actions = useUserActions()
  const user = useRecoilValue(userSelector)
  const idToken = useRecoilValue(idTokenAtom)
  const hasAdminAccess = useRecoilValue(hasAdminAccessSelector)
  const inAdmin = !!toggleMenu
  const linkBorder = hasAdminAccess ? '2px solid #fcfcfc' : undefined
  const mainBorder = inAdmin ? undefined : linkBorder

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
        <Link to="/" component={SpaLink}>
          <IconButton sx={{ mx: { xs: 1, sm: 1 }, p: 0, height: 36 }}>
            <img src={logo} width="29" height="36" alt="Suomen noutajakoirajärjestö" />
          </IconButton>
        </Link>
        <Link to="/" component={SpaLink} sx={{ textDecoration: 'none', borderBottom: mainBorder, mr: 1, px: 1 }}>
          <Typography color="secondary" variant="subtitle1" noWrap component="div" sx={{ flexShrink: 1 }}>
            Koekalenteri
          </Typography>
        </Link>
        {hasAdminAccess && <AdminLink active={inAdmin} activeBorder={linkBorder} />}
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
        </Suspense>
      </Toolbar>
    </AppBar>
  )
}

export default Header
