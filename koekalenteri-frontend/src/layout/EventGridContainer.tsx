import { CircularProgress, Grid } from '@mui/material';
import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import { EventGrid } from '../components';
import { useStores } from '../stores';

export const EventGridContainer = observer(function EventGridContainer() {
  const { privateStore } = useStores();
  if (privateStore.loading) {
    return (
      <Grid container justifyContent="center"><CircularProgress /></Grid>
    )
  }
  return (
    <EventGrid events={toJS(privateStore.events)}></EventGrid>
  )
});
