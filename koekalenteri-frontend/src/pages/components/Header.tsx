import { Suspense } from 'react'
import { Menu } from '@mui/icons-material'
import { AppBar, IconButton, Link, Toolbar, Typography } from '@mui/material'
import { useRecoilValue } from 'recoil'

import logo from '../../assets/snj-logo.png'
import { Path } from '../../routeConfig'
import { userNameSelector } from '../recoil'

import LanguageMenu from './header/LanguageMenu'
import UserMenu from './header/UserMenu'

interface Props {
  title?: string
  toggleMenu?: () => void
}

const Header = ({ title, toggleMenu }: Props) => {
  const userName = useRecoilValue(userNameSelector)
  const inAdmin = !!toggleMenu
  const linkBorder = userName ? '2px solid #000' : undefined
  const adminBorder = inAdmin ? linkBorder : undefined
  const mainBorder = inAdmin ? undefined : linkBorder

  return (
    <AppBar position="fixed" color="secondary">
      <Toolbar variant="dense" disableGutters sx={{ width: '100%', px: 1, height: 36, minHeight: 36 }}>
        {toggleMenu ? (
          <IconButton sx={{ display: { sm: 'inline-flex', md: 'none' } }} onClick={toggleMenu}>
            <Menu />
          </IconButton>
        ) : null}
        <Link href="/">
          <IconButton sx={{ mx: { xs: 1, sm: 1 }, p: 0, height: 36 }}>
            <img src={logo} height="100%" alt="Suomen noutajakoirajärjestö" />
          </IconButton>
        </Link>
        <Link href="/" sx={{ textDecoration: 'none', borderBottom: mainBorder, mr: 1, px: 1 }}>
          <Typography variant="subtitle1" noWrap component="div" sx={{ flexShrink: 1 }}>
            Koekalenteri
          </Typography>
        </Link>
        <Link
          href={Path.admin.index}
          sx={{
            textDecoration: 'none',
            borderBottom: adminBorder,
            mr: 1,
            px: 1,
            display: userName ? undefined : 'none',
          }}
        >
          <Typography variant="subtitle1" noWrap component="div" sx={{ flexShrink: 1 }}>
            Ylläpito
          </Typography>
        </Link>
        <Typography
          variant="h6"
          color="primary.dark"
          noWrap
          component="div"
          sx={{ ml: 1, flexGrow: 1, flexShrink: 10000 }}
        >
          {title ? ' › ' + title : ''}
        </Typography>
        <Suspense>
          <LanguageMenu />
          <UserMenu />
        </Suspense>
      </Toolbar>
    </AppBar>
  )
}

export default Header
