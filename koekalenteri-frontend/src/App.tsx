import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { Routes, Route } from "react-router-dom";
import { locales, LocaleKey } from "./i18n";
import { SearchPage, EventPage } from './pages'
import { useTranslation } from 'react-i18next';

function App() {
  const { i18n } = useTranslation();
  const locale = i18n.language as LocaleKey;

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} locale={locales[locale]}>
      <Routes>
        <Route path="/" element={<SearchPage />} />
        <Route path="/event/:eventType/:id"  element={<EventPage />} />
        <Route path="/event/:eventType/:id/:class"  element={<EventPage />} />
        <Route path="/event/:eventType/:id/:class/:date"  element={<EventPage />} />
      </Routes>
    </LocalizationProvider>
  );
}

export default App;
