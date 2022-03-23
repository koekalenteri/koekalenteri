import { ReactNode, useEffect } from 'react';
import { Box, Toolbar } from '@mui/material';
import { Header } from '../layout';
import { useStores, useSessionStarted } from '../stores';
import { SideMenu } from '../layout/SideMenu';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { Navigate, useLocation } from 'react-router-dom';

export function AuthPage({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { route } = useAuthenticator(context => [context.route]);
  const { publicStore, privateStore } = useStores();
  const [sessionStarted, setSessionStarted] = useSessionStarted();

  useEffect(() => {
    if (!sessionStarted) {
      setSessionStarted(new Date().toISOString());
    }
    if (!publicStore.loaded) {
      publicStore.load();
    }
    if (!privateStore.loaded) {
      privateStore.load();
    }
  });

  return (route !== 'authenticated' ? <Navigate to="/login" state={{ from: location }} replace /> :
    <>
      <Header />
      <Box sx={{ display: 'flex', height: '100%' }}>
        <SideMenu />
        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'auto' }}>
          <Toolbar variant="dense" />
          {children}
        </Box>
      </Box>
    </>
  );
}
