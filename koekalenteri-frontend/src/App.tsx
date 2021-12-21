import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { SnackbarProvider } from 'notistack';
import { Routes, Route } from 'react-router-dom';
import { locales, muiLocales, LocaleKey } from './i18n';
import { SearchPage, EventPage, ListPage, JudgesPage, UsersPage, OrganizationsPage } from './pages'
import { useTranslation } from 'react-i18next';
import { makeStyles, ThemeProvider } from '@mui/styles';
import { createTheme } from '@mui/material/styles';

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
    <ThemeProvider theme={(outerTheme) => createTheme(outerTheme, muiLocales[locale])}>
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
            <Route path="/sihteeri/events" element={<ListPage />} />
            <Route path="/sihteeri/organizations" element={<OrganizationsPage />} />
            <Route path="/sihteeri/users" element={<UsersPage />} />
            <Route path="/sihteeri/judges" element={<JudgesPage />} />
          </Routes>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}

export default App;
