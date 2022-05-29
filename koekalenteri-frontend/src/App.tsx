import { Auth } from '@aws-amplify/auth';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';
import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { createTheme } from '@mui/material/styles';
import { makeStyles, ThemeProvider } from '@mui/styles';
import { SnackbarProvider } from 'notistack';
import { useTranslation } from 'react-i18next';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AWSConfig } from './amplify-env';
import { ADMIN_DEFAULT, ADMIN_EDIT_EVENT, ADMIN_EVENTS, ADMIN_EVENT_TYPES, ADMIN_JUDGES, ADMIN_NEW_EVENT, ADMIN_OFFICIALS, ADMIN_ORGS, ADMIN_ROOT, ADMIN_USERS, ADMIN_VIEW_EVENT } from './config';
import { Language, locales, muiLocales } from './i18n';
import { EventEditPage, EventListPage, EventRegistrationPage, EventTypeListPage, EventViewPage, JudgeListPage, LoginPage, LogoutPage, OfficialListPage, OrganizerListPage, SearchPage, UsersPage } from './pages';

Auth.configure(AWSConfig);

const useStyles = makeStyles({
  snack: {
    paddingTop: 38 // So snacks appear below the header
  }
});

function App() {
  const { i18n } = useTranslation();
  const language = i18n.language as Language;
  const classes = useStyles();

  return (
    <ThemeProvider theme={(outerTheme) => createTheme(outerTheme, muiLocales[language])}>
      <LocalizationProvider dateAdapter={AdapterDateFns} locale={locales[language]}>
        <SnackbarProvider
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          classes={{ containerRoot: classes.snack }}
          maxSnack={3}
        >
          <Authenticator.Provider>
            <Routes>
              <Route path="/" element={<SearchPage />} />
              <Route path="/event/:eventType/:id"  element={<EventRegistrationPage />} />
              <Route path="/event/:eventType/:id/:class"  element={<EventRegistrationPage />} />
              <Route path="/event/:eventType/:id/:class/:date" element={<EventRegistrationPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/logout" element={<LogoutPage />} />
              <Route path={ADMIN_ROOT} element={<Navigate replace to={ADMIN_DEFAULT} />} />
              <Route path={ADMIN_EVENTS} element={<EventListPage />} />
              <Route path={ADMIN_NEW_EVENT} element={<EventEditPage create />} />
              <Route path={`${ADMIN_EDIT_EVENT}/:id`} element={<EventEditPage />} />
              <Route path={`${ADMIN_VIEW_EVENT}/:id`} element={<EventViewPage />} />
              <Route path={`${ADMIN_VIEW_EVENT}/:id/:reistrationId`} element={<EventViewPage />} />
              <Route path={ADMIN_ORGS} element={<OrganizerListPage />} />
              <Route path={ADMIN_OFFICIALS} element={<OfficialListPage />} />
              <Route path={ADMIN_USERS} element={<UsersPage />} />
              <Route path={ADMIN_JUDGES} element={<JudgeListPage />} />
              <Route path={ADMIN_EVENT_TYPES} element={<EventTypeListPage />} />
            </Routes>
          </Authenticator.Provider>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}

export default App;
