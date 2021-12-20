import { observer } from 'mobx-react-lite';
import { EventGrid }  from '../components';
import { useStores } from '../stores';
import { CircularProgress, Grid } from '@mui/material';

export const EventGridContainer = observer(() => {
  const { eventStore } = useStores();
  if (eventStore.loading) {
    return (
      <Grid container justifyContent="center"><CircularProgress /></Grid>
    )
  }
  return (
    <EventGrid events={[...eventStore.events]}></EventGrid>
  )
});
