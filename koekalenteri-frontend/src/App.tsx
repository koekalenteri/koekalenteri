import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { SnackbarProvider } from 'notistack';
import { Routes, Route } from "react-router-dom";
import { locales, LocaleKey } from "./i18n";
import { SearchPage, EventPage, ListPage } from './pages'
import { useTranslation } from 'react-i18next';
import { makeStyles } from '@mui/styles';

const useStyles = makeStyles({
  snack: {
    paddingTop: 38
  }
});

function App() {
  const { i18n } = useTranslation();
  const locale = i18n.language as LocaleKey;
  const classes = useStyles();

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} locale={locales[locale]}>
      <SnackbarProvider
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        classes={{ containerRoot: classes.snack }}
        maxSnack={3}
      >
        <Routes>
          <Route path="/" element={<SearchPage />} />
          <Route path="/event/:eventType/:id"  element={<EventPage />} />
          <Route path="/event/:eventType/:id/:class"  element={<EventPage />} />
          <Route path="/event/:eventType/:id/:class/:date" element={<EventPage />} />
          <Route path="/sihteeri" element={<ListPage />} />
        </Routes>
      </SnackbarProvider>
    </LocalizationProvider>
  );
}

export default App;
