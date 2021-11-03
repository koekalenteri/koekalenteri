import { useEffect } from 'react';
import { Box } from '@mui/material';
import { EventContainer, EventFilterContainer, Header } from '../layout';
import { useStores } from '../use-stores';

export const SearchPage = () => {
  const { eventStore, judgeStore, organizerStore } = useStores();

  useEffect(() => {
    if (!eventStore.loaded) {
      eventStore.load();
      judgeStore.load();
      organizerStore.load()
    }
  });

  return (
    <>
      <Header />
      <Box>
        <EventFilterContainer/>
        <EventContainer/>
      </Box>
    </>
  )
}
