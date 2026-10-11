import { Authenticator } from '@aws-amplify/ui-react'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { Amplify } from 'aws-amplify'
import i18n from 'i18next'
import { useAtomValue } from 'jotai'
import { ConfirmProvider } from 'material-ui-confirm'
import { Suspense, useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { AWSConfig } from './amplify-env'
import { useAuthSessionInitialization } from './hooks/useAuthSessionInitialization'
import { useAuthSessionRefresh } from './hooks/useAuthSessionRefresh'
import WebSocketProvider from './hooks/WebSocketProvider'
import { locales, muiLocales } from './i18n'
import { reportError } from './lib/client/error'
import AppSnackbarProvider from './pages/components/AppSnackbarProvider'
import ServiceWorkerUpdateNotifier from './pages/components/ServiceWorkerUpdateNotifier'
import { LoadingPage } from './pages/LoadingPage'
import { idTokenAtom, languageAtom } from './pages/state'
import routes from './routes'

try {
  Amplify.configure(AWSConfig)
} catch (e) {
  reportError(e)
}

const router = createBrowserRouter(routes)

function App() {
  const language = useAtomValue(languageAtom)
  const idToken = useAtomValue(idTokenAtom)
  const authSessionInitialized = useAuthSessionInitialization(idToken)
  useAuthSessionRefresh(authSessionInitialized ? idToken : undefined)

  useEffect(() => {
    // The stored choice is the source of truth. i18n boots in it (src/i18n/index.ts); this effect is
    // the guard that brings i18n back to it when the choice changes later (KOE-1268, KOE-1457).
    if (i18n.language !== language) void i18n.changeLanguage(language)
    document.documentElement.lang = language
  }, [language])

  return (
    <ThemeProvider theme={(outerTheme) => createTheme(outerTheme, muiLocales[language])}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <AppSnackbarProvider>
          <ServiceWorkerUpdateNotifier />
          <ConfirmProvider
            defaultOptions={{
              allowClose: true,
              buttonOrder: ['confirm', 'cancel'],
              cancellationButtonProps: { variant: 'outlined' },
              confirmationButtonProps: { autoFocus: true, variant: 'contained' },
            }}
          >
            <Authenticator.Provider key={idToken ? 'authenticated' : 'anonymous'}>
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
        </AppSnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

export default App
