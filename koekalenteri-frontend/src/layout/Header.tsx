import React from 'react';
import makeStyles from '@mui/styles/makeStyles';
import { AppBar, Typography, IconButton, Toolbar, Link } from '@mui/material';
import AccountBox from '@mui/icons-material/AccountBox';
import LanguageIcon from '@mui/icons-material/Language';
import logo from '../assets/snj-logo.png';
import banner from '../assets/banner.png';

const useStyles = makeStyles((theme) => ({
  header: {
    backgroundImage: `url(${banner})`,
    backgroundPositionY: '20px',
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    height: '260px',
  },
  title: {
    flexGrow: 1,
    color: 'rgba(0, 0, 0, 0.87)',
  },
  logo: {
    maxWidth: 40,
    marginRight: '10px',
  },
}));

const Header = () => {
  const classes = useStyles();

  return (
    <div className={classes.header}>
      <AppBar position="static" color="secondary">
        <Toolbar>
          <Link href="https://www.snj.fi/" target="_blank"  rel="noopener">
            <IconButton size="large">
              <img src={logo} alt="Suomen noutajakoirajärjestö" className={classes.logo} />
            </IconButton>
          </Link>
          <Typography className={classes.title} variant="h6">
            Koekalenteri
          </Typography>
          <IconButton size="large">
            <LanguageIcon />
          </IconButton>
          <IconButton size="large">
            <AccountBox />
          </IconButton>
        </Toolbar>
      </AppBar>
    </div>
  );
}

export default Header;
