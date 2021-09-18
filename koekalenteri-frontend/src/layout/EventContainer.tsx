import { observer } from 'mobx-react-lite';
import EventTable from '../components/EventTable';
import { useStores } from '../use-stores';
import { CircularProgress, Grid } from '@mui/material';

const EventContainer = observer(() => {
  const { eventStore } = useStores();
  if (eventStore.loading) {
    return (
      <Grid container justifyContent="center"><CircularProgress /></Grid>
    )
  }
  return (
    <EventTable events={eventStore.events}></EventTable>
  )
});

export default EventContainer;
