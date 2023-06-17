import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Link as SpaLink } from 'react-router-dom'
import Menu from '@mui/icons-material/Menu'
import AppBar from '@mui/material/AppBar'
import IconButton from '@mui/material/IconButton'
import Link from '@mui/material/Link'
import Toolbar from '@mui/material/Toolbar'
import Typography from '@mui/material/Typography'
import { useRecoilValue } from 'recoil'

import logo from '../../assets/snj-logo.png'
import { Path } from '../../routeConfig'
import { hasAdminAccessSelector, userNameSelector } from '../recoil'

import LanguageMenu from './header/LanguageMenu'
import UserMenu from './header/UserMenu'

interface Props {
  toggleMenu?: () => void
}

const Header = ({ toggleMenu }: Props) => {
  const { t } = useTranslation()
  const userName = useRecoilValue(userNameSelector)
  const hasAdminAccess = useRecoilValue(hasAdminAccessSelector)
  const inAdmin = !!toggleMenu
  const linkBorder = userName ? '2px solid #000' : undefined
  const adminBorder = inAdmin ? linkBorder : undefined
  const mainBorder = inAdmin ? undefined : linkBorder

  return (
    <AppBar position="fixed" color="secondary" elevation={0}>
      <Toolbar variant="dense" disableGutters sx={{ width: '100%', px: 1, height: 36, minHeight: 36 }}>
        {toggleMenu ? (
          <IconButton sx={{ display: { sm: 'inline-flex', md: 'none' } }} onClick={toggleMenu}>
            <Menu />
          </IconButton>
        ) : null}
        <Link to="/" component={SpaLink}>
          <IconButton sx={{ mx: { xs: 1, sm: 1 }, p: 0, height: 36 }}>
            <img src={logo} height="100%" alt="Suomen noutajakoirajärjestö" />
          </IconButton>
        </Link>
        <Link to="/" component={SpaLink} sx={{ textDecoration: 'none', borderBottom: mainBorder, mr: 1, px: 1 }}>
          <Typography variant="subtitle1" noWrap component="div" sx={{ flexShrink: 1 }}>
            Koekalenteri
          </Typography>
        </Link>
        {hasAdminAccess && (
          <Link
            to={Path.admin.index}
            component={SpaLink}
            sx={{
              textDecoration: 'none',
              borderBottom: adminBorder,
              mr: 1,
              px: 1,
            }}
          >
            <Typography variant="subtitle1" noWrap component="div" sx={{ flexShrink: 1 }}>
              {t('admin')}
            </Typography>
          </Link>
        )}
        <Typography
          variant="h6"
          color="primary.dark"
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
