import { useAuthenticator } from '@aws-amplify/ui-react';
import { Box, Toolbar } from '@mui/material';
import { autorun } from 'mobx';
import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Header } from '../layout';
import { SideMenu } from '../layout/SideMenu';
import { useSessionStarted, useStores } from '../stores';

export function AuthPage({ children, title }: { children: ReactNode, title?: string }) {
  const location = useLocation();
  const { route } = useAuthenticator(context => [context.route]);
  const { rootStore, publicStore, privateStore } = useStores();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sessionStarted, setSessionStarted] = useSessionStarted();

  useEffect(() => {
    if (!sessionStarted) {
      setSessionStarted(new Date().toISOString());
    }
  });
  useEffect(() => {
    if (!rootStore.loaded) {
      rootStore.load();
    }
    autorun(() => {
      if (!publicStore.loaded) {
        publicStore.load();
      }
      if (!privateStore.loaded) {
        privateStore.load();
      }
    })
  });


  const toggleMenu = () => {
    console.log('toggleMenu', menuOpen);
    setMenuOpen(!menuOpen);
  }

  return (route !== 'authenticated' ? <Navigate to="/login" state={{ from: location }} replace /> :
    <>
      <Header title={title} toggleMenu={toggleMenu} />
      <Box sx={{ display: 'flex', height: '100%' }}>
        <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
        <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'auto' }}>
          <Toolbar variant="dense" />
          {children}
        </Box>
      </Box>
    </>
  );
};
