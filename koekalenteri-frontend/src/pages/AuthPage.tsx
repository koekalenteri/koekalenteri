import { ReactNode, useEffect } from 'react';
import { Box, Toolbar } from '@mui/material';
import { Header } from '../layout';
import { useStores, useSessionStarted } from '../stores';
import { SideMenu } from '../layout/SideMenu';

export function AuthPage({children}: {children: ReactNode}) {
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

  return (
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
  )
}

