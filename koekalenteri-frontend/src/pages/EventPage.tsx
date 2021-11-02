import { useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import { Header } from '../layout';
import { useStores } from '../use-stores';
import { EventEx } from 'koekalenteri-shared';
import { EventInfo } from '../components';

export const EventPage = () => {
  const params = useParams();
  const { eventStore } = useStores();
  const [event, setEvent] = useState<EventEx>();

  useEffect(() => {
    async function get(id: string) {
      const result = await eventStore.get(id);
      setEvent(result);
    }
    if (params.id) {
      get(params.id);
    }
  });

  return (
    <>
      <Header />
      <Box>
        {eventStore.loaded && <Link to="/">Home</Link>}
        { event ? <EventInfo event={event} /> : <CircularProgress />}
      </Box>
    </>
  )
}
