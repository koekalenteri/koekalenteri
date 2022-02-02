import { observer } from 'mobx-react-lite';
import { useStores } from '../stores';
import { EventFilter } from '../components';
import { FilterProps } from '../stores/PublicStore';

export const EventFilterContainer = observer(() => {
  const { publicStore } = useStores();

  return (
    <EventFilter
      judges={publicStore.judges}
      organizers={publicStore.organizers}
      filter={{ ...publicStore.filter }}
      onChange={(filter: FilterProps) => publicStore.setFilter(filter)}
    />
  )
});
