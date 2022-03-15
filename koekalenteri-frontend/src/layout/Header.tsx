import { AppBar, Typography, IconButton, Toolbar, Link, Box } from '@mui/material';
import logo from '../assets/snj-logo.png';
import banner from '../assets/banner.png';
import { LanguageMenu, UserMenu } from '../components';

export function Header({title}: {title?: string}) {
  return (
    <AppBar position="fixed" color="secondary">
      <Toolbar variant="dense" sx={{ width: '100%' }}>
        <Link href="/">
          <IconButton size="large" sx={{ mr: { xs: 1, sm: 2 }, p: 0 }}>
            <img src={logo} alt="Suomen noutajakoirajärjestö" />
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
