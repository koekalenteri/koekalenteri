import { Box } from '@mui/material';
import { toJS } from 'mobx';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { deserializeFilter, EventFilter, serializeFilter } from '../components';
import { Banner, EventContainer, Header } from '../layout';
import { useSessionStarted, useStores } from '../stores';
import { FilterProps } from '../stores/PublicStore';

export const SearchPage = () => {
  const { rootStore, publicStore } = useStores();
  const [sessionStarted, setSessionStarted] = useSessionStarted();
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = useState(deserializeFilter(searchParams));

  const organizers = toJS(rootStore.organizerStore.organizers);
  const judges = toJS(rootStore.judgeStore.judges);

  const handleChange = (filter: FilterProps) => {
    setFilter(filter);
    setSearchParams(serializeFilter(filter));
    publicStore.setFilter(filter);
  };

  useEffect(() => {
    if (!sessionStarted) {
      setSessionStarted(new Date().toISOString());
    }
    if (!rootStore.loaded) {
      rootStore.load();
    }
    if (!publicStore.loaded) {
      publicStore.load();
    }
  });

  useEffect(() => {
    const value = deserializeFilter(searchParams);
    setFilter(value);
    publicStore.setFilter(value);
  }, [searchParams, publicStore]);

  return (
    <>
      <Header />
      <Banner />
      <Box>
        <EventFilter organizers={organizers} judges={judges} filter={filter} onChange={handleChange} />
        <EventContainer />
      </Box>
    </>
  )
}
