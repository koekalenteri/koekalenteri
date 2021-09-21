import { observer } from 'mobx-react-lite';
import { useStores } from '../use-stores';
import EventFilter from '../components/EventFilter';
import { FilterProps } from '../stores/EventStrore';

const EventFilterContainer = observer(() => {
  const { eventStore, judgeStore } = useStores();

  return (
    <EventFilter judges={judgeStore.judges} filter={{ ...eventStore.filter }} onChange={(filter: FilterProps) => eventStore.setFilter(filter)}></EventFilter>
  )
});

export default EventFilterContainer;
