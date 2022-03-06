import AdapterDateFns from '@mui/lab/AdapterDateFns';
import LocalizationProvider from '@mui/lab/LocalizationProvider';
import { SnackbarProvider } from 'notistack';
import { Routes, Route, Navigate } from 'react-router-dom';
import { locales, muiLocales, LocaleKey } from './i18n';
import { EventEditPage, EventListPage, EventRegistrationPage, JudgeListPage, LoginPage, LogoutPage, OrganizationListPage, SearchPage, UsersPage } from './pages'
import { useTranslation } from 'react-i18next';
import { makeStyles, ThemeProvider } from '@mui/styles';
import { createTheme } from '@mui/material/styles';
import { ADMIN_DEFAULT, ADMIN_EDIT_EVENT, ADMIN_EVENTS, ADMIN_JUDGES, ADMIN_NEW_EVENT, ADMIN_ORGS, ADMIN_ROOT, ADMIN_USERS } from './config';
import { AWSConfig } from './amplify-env';
import { Amplify, Auth } from 'aws-amplify';
import { Authenticator } from '@aws-amplify/ui-react';
import '@aws-amplify/ui-react/styles.css';

Amplify.configure(AWSConfig);
Auth.configure(AWSConfig);

const useStyles = makeStyles({
  snack: {
    paddingTop: 38 // So snacks appear below the header
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
              <Route path={ADMIN_ORGS} element={<OrganizationListPage />} />
              <Route path={ADMIN_USERS} element={<UsersPage />} />
              <Route path={ADMIN_JUDGES} element={<JudgeListPage />} />
            </Routes>
          </Authenticator.Provider>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}

export default App;
