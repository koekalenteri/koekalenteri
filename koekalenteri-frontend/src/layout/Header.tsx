import { Menu } from '@mui/icons-material';
import { AppBar, Box,IconButton, Link, Toolbar, Typography } from '@mui/material';

import banner from '../assets/banner.png';
import logo from '../assets/snj-logo.png';
import { LanguageMenu, UserMenu } from '../components';

interface Props {
  title?: string,
  toggleMenu?: () => void
}

export function Header({title, toggleMenu}: Props) {
  return (
    <AppBar position="fixed" color="secondary">
      <Toolbar variant="dense" disableGutters sx={{ width: '100%', px: 1 }}>
        {toggleMenu
          ? <IconButton sx={{display: {sm: 'inline-flex', md: 'none'}}} onClick={toggleMenu}><Menu /></IconButton>
          : null}
        <Link href="/">
          <IconButton sx={{ mx: { xs: 1, sm: 1 }, p: 0, height: 36 }}>
            <img src={logo} height="100%" alt="Suomen noutajakoirajärjestö" />
          </IconButton>
        </Link>
        <Link href="/" sx={{textDecoration: 'none'}}>
          <Typography variant="h6" noWrap component="div" sx={{flexShrink: 1}}>
            Koekalenteri
          </Typography>
        </Link>
        <Typography variant="h6" color="primary.dark" noWrap component="div" sx={{ ml: 1, flexGrow: 1, flexShrink: 10000 }}>
          {title ? ' › ' + title : ''}
        </Typography>
        <LanguageMenu />
        <UserMenu />
      </Toolbar>
    </AppBar>
  );
}

export function Banner() {
  return (
    <Box sx={{
      backgroundImage: `url(${banner})`,
      backgroundRepeat: 'no-repeat',
      backgroundPositionY: '48px',
      backgroundSize: 'cover',
      width: '100%',
      height: { xs: 98, sm: 148, md: 260 },
    }}></Box>
  );
}
