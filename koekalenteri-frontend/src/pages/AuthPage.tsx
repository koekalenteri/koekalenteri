import { ReactNode, useEffect } from 'react';
import { Box, Toolbar } from '@mui/material';
import { Header } from '../layout';
import { useStores, useSessionStarted } from '../stores';
import { SideMenu } from '../layout/SideMenu';

export function AuthPage({children}: {children: ReactNode}) {
  const { eventStore, judgeStore, organizerStore } = useStores();
  const [sessionStarted, setSessionStarted] = useSessionStarted();

  useEffect(() => {
    if (!sessionStarted) {
      setSessionStarted(new Date().toISOString());
    }
    if (!eventStore.loaded) {
      eventStore.load();
      judgeStore.load();
      organizerStore.load()
    }
  });

  return (
    <>
      <Header />
      <Box sx={{ display: 'flex' }}>
        <SideMenu />
        <Box sx={{ p: 2, flexGrow: 1, overflow: 'auto' }}>
          <Toolbar variant="dense" />
          {children}
        </Box>
      </Box>
    </>
  )
}

