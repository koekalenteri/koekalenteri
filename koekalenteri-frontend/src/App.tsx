import { useEffect } from 'react';
import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import fi from 'date-fns/locale/fi';
import Header from './layout/Header';
import SearchPage from './pages/SearchPage'
import { useStores } from './use-stores';

function App() {

  const { eventStore } = useStores();

  useEffect(() => {
    eventStore.load();
  });

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} locale={fi}>
      <Header/>
      <SearchPage />
    </LocalizationProvider>
  );
}

export default App;
