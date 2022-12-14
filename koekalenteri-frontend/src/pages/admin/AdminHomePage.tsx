import { useAuthenticator } from '@aws-amplify/ui-react';
import { Box, Toolbar } from '@mui/material';
import { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Header, SideMenu } from '../../layout';

export function AdminHomePage() {
  const location = useLocation();
  const { route } = useAuthenticator(context => [context.route]);
  const [menuOpen, setMenuOpen] = useState(false);

  return (route !== 'authenticated' ? <Navigate to="/login" state={{ from: location }} replace /> :
    <>
      <Header title={'Admin'} toggleMenu={() => setMenuOpen(!menuOpen)} />
      <Box sx={{ display: 'flex', height: '100%' }}>
        <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'auto' }}>
          <Toolbar variant="dense" />
          <Outlet />
        </Box>
      </Box>
    </>
  )
}
