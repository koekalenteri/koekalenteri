import { observer } from 'mobx-react-lite';
import { useStores } from '../use-stores';
import { EventFilter } from '../components';
import { FilterProps } from '../stores/EventStrore';

export const EventFilterContainer = observer(() => {
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
