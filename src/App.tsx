import type { SnackbarKey } from 'notistack'
import { Authenticator } from '@aws-amplify/ui-react'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { Amplify } from 'aws-amplify'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { Suspense, useCallback } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { useRecoilValue } from 'recoil'
import { AWSConfig } from './amplify-env'
import { useAuthSessionInitialization } from './hooks/useAuthSessionInitialization'
import { useAuthSessionRefresh } from './hooks/useAuthSessionRefresh'
import WebSocketProvider from './hooks/WebSocketProvider'
import { locales, muiLocales } from './i18n'
import { reportError } from './lib/client/error'
import SnackbarCloseButton from './pages/components/SnackbarCloseButton'
import { LoadingPage } from './pages/LoadingPage'
import { idTokenAtom, languageAtom } from './pages/recoil'
import routes from './routes'

try {
  Amplify.configure(AWSConfig)
} catch (e) {
  reportError(e)
}

const router = createBrowserRouter(routes)

function App() {
  const language = useRecoilValue(languageAtom)
  const idToken = useRecoilValue(idTokenAtom)
  const authSessionInitialized = useAuthSessionInitialization(idToken)
  const closeAction = useCallback((snackbarKey: SnackbarKey) => <SnackbarCloseButton snackbarKey={snackbarKey} />, [])
  useAuthSessionRefresh(authSessionInitialized ? idToken : undefined)

  return (
    <ThemeProvider theme={(outerTheme) => createTheme(outerTheme, muiLocales[language])}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <SnackbarProvider
          anchorOrigin={{ horizontal: 'right', vertical: 'top' }}
          classes={{ containerRoot: 'snack' }}
          disableWindowBlurListener
          preventDuplicate
          maxSnack={3}
          autoHideDuration={8000}
          action={closeAction}
        >
          <ConfirmProvider
            defaultOptions={{
              allowClose: true,
              buttonOrder: ['confirm', 'cancel'],
              cancellationButtonProps: { variant: 'outlined' },
              confirmationButtonProps: { autoFocus: true, variant: 'contained' },
            }}
          >
            <Authenticator.Provider>
              {authSessionInitialized ? (
                <WebSocketProvider>
                  <Suspense fallback={<LoadingPage />}>
                    <RouterProvider router={router} />
                  </Suspense>
                </WebSocketProvider>
              ) : (
                <LoadingPage />
              )}
            </Authenticator.Provider>
          </ConfirmProvider>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

export default App
