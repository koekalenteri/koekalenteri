import { observer } from 'mobx-react-lite';
import EventTable from '../components/EventTable';
import { useStores } from '../use-stores';


const MainContainer = observer(() => {
  const { eventStore } = useStores();

  return (
    <EventTable events={eventStore.events}></EventTable>
  )
});

export default MainContainer;
