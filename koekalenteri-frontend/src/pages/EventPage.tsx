import { useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import { Link, useParams } from 'react-router-dom';
import Header from '../layout/Header';
import { useStores } from '../use-stores';
import { Event } from 'koekalenteri-shared/model';

export const EventPage = () => {
  const params = useParams();
  const { eventStore } = useStores();
  const [event, setEvent] = useState<Event>();

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

type EventInfoProps = {
  event: Event
}

function EventInfo({event}: EventInfoProps) {
  return <pre>{JSON.stringify(event, null, '  ')}</pre>;
}
