import { AppBar, Typography, IconButton, Toolbar, Link, Box } from '@mui/material';
import logo from '../assets/snj-logo.png';
import banner from '../assets/banner.png';
import { LanguageMenu, UserMenu } from '../components';
import { Menu } from '@mui/icons-material';

export function Header({title, toggleMenu}: {title?: string, toggleMenu?: () => void}) {
  return (
    <AppBar position="fixed" color="secondary">
      <Toolbar variant="dense" disableGutters sx={{ width: '100%', px: 1 }}>
        <IconButton sx={{display: {sm: 'inline-flex', md: 'none'}}} onClick={() => toggleMenu && toggleMenu()}><Menu /></IconButton>
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
