import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { AppBar, Typography, IconButton, Toolbar, Link } from '@material-ui/core';
import AccountBox from '@material-ui/icons/AccountBox';
import logo from '../assets/snj-logo.jpeg';
 
const useStyles = makeStyles((theme) => ({
  title: {
    flexGrow: 1,    
  },
  logo: {
    maxWidth: 40,
    marginRight: '10px',
  }
}));
  



const Header = () => {
  const classes = useStyles();

  return (
    <div>    
      <AppBar position="static">
        <Toolbar>
          <Link href="https://www.snj.fi/" target="_blank"  rel="noopener">
            <IconButton>
              <img src={logo} alt="Suomen noutajakoirajärjestö" className={classes.logo} /> 
            </IconButton>
          </Link>
          <Typography className={classes.title} variant="h6">
                        Welcome
          </Typography>
          <IconButton onClick={() => { alert('clicked') }}> 
            <AccountBox />
          </IconButton>
        </Toolbar>
      </AppBar>
    </div>
  )
}

export default Header;