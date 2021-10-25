import { observer } from 'mobx-react-lite';
import { useStores } from '../use-stores';
import EventFilter from '../components/EventFilter';
import { FilterProps } from '../stores/EventStrore';

const EventFilterContainer = observer(() => {
  const { eventStore, judgeStore, organizerStore } = useStores();

  return (
    <EventFilter
      judges={judgeStore.judges}
      organizers={organizerStore.organizers}
      filter={{ ...eventStore.filter }}
      onChange={(filter: FilterProps) => eventStore.setFilter(filter)}
    />
  )
});

export default EventFilterContainer;
