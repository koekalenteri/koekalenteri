import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { Routes, Route } from "react-router-dom";
import fi from 'date-fns/locale/fi';
import { SearchPage, EventPage } from './pages'

function App() {
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} locale={fi}>
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/event/:id" element={<EventPage />} />
      </Routes>
    </LocalizationProvider>
  );
}

export default App;
