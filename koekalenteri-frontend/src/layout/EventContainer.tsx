import { observer } from 'mobx-react-lite';
import { EventTable }  from '../components';
import { useStores } from '../stores';
import { CircularProgress, Grid } from '@mui/material';

export const EventContainer = observer(() => {
  const { publicStore } = useStores();
  if (publicStore.loading) {
    return (
      <Grid container justifyContent="center"><CircularProgress /></Grid>
    )
  }
  return (
    <EventTable events={publicStore.filteredEvents}></EventTable>
  )
});
