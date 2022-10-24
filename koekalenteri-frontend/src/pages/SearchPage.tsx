import { Box } from '@mui/material';
import { toJS } from 'mobx';
import { observer } from 'mobx-react-lite';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { deserializeFilter, EventFilter, serializeFilter } from '../components';
import Version from '../components/Version';
import { Banner, EventContainer, Header } from '../layout';
import { useSessionStarted, useStores } from '../stores';
import { FilterProps } from '../stores/PublicStore';

export const SearchPage = observer(function SearchPage() {
  const { rootStore, publicStore } = useStores();
  const [sessionStarted, setSessionStarted] = useSessionStarted();

  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState(deserializeFilter(searchParams));

  const organizers = toJS(rootStore.organizerStore.organizers);
  const judges = rootStore.judgeStore.activeJudges.map(j => { return {...j}});
  const eventTypes = toJS(rootStore.eventTypeStore.activeEventTypes);

  const handleChange = (filter: FilterProps) => {
    setFilter(filter);
    setSearchParams(serializeFilter(filter));
  }

  useEffect(() => {
    publicStore.setFilter(filter);
  }, [filter, publicStore])

  useEffect(() => {
    if (!sessionStarted) {
      setSessionStarted(new Date().toISOString());
    }
  }, [sessionStarted, setSessionStarted]);

  useEffect(() => {
    if (!rootStore.loaded) {
      rootStore.load();
    }
  }, [rootStore])

  useEffect(() => {
    publicStore.initialize()
  }, [publicStore]);

  return (
    <>
      <Header />
      <Banner />
      <Box>
        <EventFilter organizers={organizers} judges={judges} filter={filter} eventTypes={eventTypes} onChange={handleChange} />
        <EventContainer store={publicStore} />
      </Box>
      <Version />
    </>
  )
})
