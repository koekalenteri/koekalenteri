import { observer } from 'mobx-react-lite';
import { useStores } from '../stores';
import { EventFilter } from '../components';
import { FilterProps } from '../stores/PublicStore';

export const EventFilterContainer = observer(() => {
  const { rootStore, publicStore } = useStores();

  return (
    <EventFilter
      judges={rootStore.judgeStore.judges}
      organizers={rootStore.organizerStore.organizers}
      filter={{ ...publicStore.filter }}
      onChange={(filter: FilterProps) => publicStore.setFilter(filter)}
    />
  )
});
