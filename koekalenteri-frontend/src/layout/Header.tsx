import { AppBar, Typography, IconButton, Toolbar, Link, Box } from '@mui/material';
import logo from '../assets/snj-logo.png';
import banner from '../assets/banner.png';
import { LanguageMenu, UserMenu } from '../components';

export function Header() {
  return (
    <AppBar position="fixed" color="secondary">
      <Toolbar variant="dense" sx={{width: '100%'}}>
        <Link href="https://www.snj.fi/" target="_blank"  rel="noopener">
          <IconButton size="large" sx={{ mr: 2, p: 0 }}>
            <img src={logo} alt="Suomen noutajakoirajärjestö" />
          </IconButton>
        </Link>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          Koekalenteri
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
      height: '260px'
    }}></Box>
  );
}
