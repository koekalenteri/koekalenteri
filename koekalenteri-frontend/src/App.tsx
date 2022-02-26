import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { SnackbarProvider } from 'notistack';
import { Routes, Route, Navigate } from 'react-router-dom';
import { locales, muiLocales, LocaleKey } from './i18n';
import { SearchPage, EventPage, ListPage, JudgesPage, UsersPage, OrganizationsPage } from './pages'
import { useTranslation } from 'react-i18next';
import { makeStyles, ThemeProvider } from '@mui/styles';
import { createTheme } from '@mui/material/styles';
import { ADMIN_DEFAULT, ADMIN_EDIT_EVENT, ADMIN_EVENTS, ADMIN_JUDGES, ADMIN_NEW_EVENT, ADMIN_ORGS, ADMIN_ROOT, ADMIN_USERS } from './config';
import { EditEventPage } from './pages/EditEventPage';

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
            <Route path={ADMIN_ROOT} element={<Navigate replace to={ADMIN_DEFAULT} />} />
            <Route path={ADMIN_EVENTS} element={<ListPage />} />
            <Route path={ADMIN_NEW_EVENT} element={<EditEventPage create />} />
            <Route path={`${ADMIN_EDIT_EVENT}/:id`} element={<EditEventPage />} />
            <Route path={ADMIN_ORGS} element={<OrganizationsPage />} />
            <Route path={ADMIN_USERS} element={<UsersPage />} />
            <Route path={ADMIN_JUDGES} element={<JudgesPage />} />
          </Routes>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}

export default App;
