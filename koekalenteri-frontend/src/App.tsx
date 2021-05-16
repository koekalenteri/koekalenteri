import { useEffect } from 'react';
import Header from './layout/Header';
import SearchPage from './pages/SearchPage'
import { useStores } from './use-stores';
import * as eventApi from './api/event';

function App() {

  const { eventStore } = useStores();

  useEffect(() => {
    async function loadEvents() {
      eventStore.events = await eventApi.getEvents();
    }
    loadEvents();
  });

  return (
    <div>
      <Header/>
      <SearchPage />
    </div>
  );
}

export default App;
