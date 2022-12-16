import { CircularProgress, Grid } from '@mui/material';
import { observer } from 'mobx-react-lite';

import { EventTable }  from '../components';
import { PublicStore } from '../stores/PublicStore';


export const EventContainer = observer(function EventContainer({ store }: { store: PublicStore }) {
  if (store.loading) {
    return (
      <Grid container justifyContent="center"><CircularProgress /></Grid>
    )
  }
  return (
    <EventTable events={store.filteredEvents} />
  )
});
