import { useEffect } from 'react';
import { Box } from '@mui/material';
import { Banner, EventContainer, EventFilterContainer, Header } from '../layout';
import { useStores, useSessionStarted } from '../stores';

export const SearchPage = () => {
  const { publicStore } = useStores();
  const [sessionStarted, setSessionStarted] = useSessionStarted();

  useEffect(() => {
    if (!sessionStarted) {
      setSessionStarted(new Date().toISOString());
    }
    if (!publicStore.loaded) {
      publicStore.load();
    }
  });

  return (
    <>
      <Header />
      <Banner />
      <Box>
        <EventFilterContainer/>
        <EventContainer/>
      </Box>
    </>
  )
}
