import { useEffect, useState } from 'react';
import { Box, Divider, Toolbar } from '@mui/material';
import { EventGridContainer, Header } from '../layout';
import { useStores, useSessionStarted } from '../stores';
import { Accessibility, Event, Logout, Menu, PersonOutline, Support } from '@mui/icons-material';
import { DrawerItem, DrawerList, MiniDrawer } from '../components/MiniDrawer';

export function ListPage() {
  const { eventStore, judgeStore, organizerStore } = useStores();
  const [sessionStarted, setSessionStarted] = useSessionStarted();
  const [mini, setMini] = useState<boolean>(false);
  const toggleMini = () => setMini(!mini);

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
      <Box sx={{display: 'flex'}}>
        <MiniDrawer
          variant="permanent"
          open={!mini}
        >
          <Toolbar variant="dense" />
          <DrawerList>
            <DrawerItem text="" icon={<Menu />} onClick={toggleMini} />
            <DrawerItem text="Kokeet" icon={<Event />} />
            <DrawerItem text="Yhdistykset" icon={<Support />} />
            <DrawerItem text="Käyttäjät" icon={<PersonOutline />} />
            <DrawerItem text="Tuomarit" icon={<Accessibility />} />
          </DrawerList>
          <Divider />
          <DrawerList>
            <DrawerItem text="Kirjaudu ulos" icon={<Logout />} />
          </DrawerList>
        </MiniDrawer>
        <Box sx={{ flexGrow: 1, overflow: 'auto' }}>
          <Toolbar variant="dense" />
          <EventGridContainer/>
        </Box>
      </Box>
    </>
  )
}

