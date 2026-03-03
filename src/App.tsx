import type { SnackbarKey } from 'notistack'

import { Suspense, useCallback, useEffect } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { scan } from 'react-scan'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { useRecoilValue } from 'recoil'

import { AuthProvider } from './auth/AuthProvider'
import { useWebSocket } from './hooks/useWebSocket'
import { isDevEnv } from './lib/env'
import SnackbarCloseButton from './pages/components/SnackbarCloseButton'
import { LoadingPage } from './pages/LoadingPage'
import { languageAtom } from './pages/recoil'
import { locales, muiLocales } from './i18n'
import routes from './routes'

const router = createBrowserRouter(routes)

function App() {
  const language = useRecoilValue(languageAtom)
  const closeAction = useCallback((snackbarKey: SnackbarKey) => <SnackbarCloseButton snackbarKey={snackbarKey} />, [])

  useWebSocket()

  useEffect(() => {
    if (isDevEnv()) {
      scan({ enabled: true })
    }
  }, [])

  return (
    <ThemeProvider theme={(outerTheme) => createTheme(outerTheme, muiLocales[language])}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <SnackbarProvider
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          classes={{ containerRoot: 'snack' }}
          disableWindowBlurListener
          preventDuplicate
          maxSnack={3}
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
            <AuthProvider>
              <Suspense fallback={<LoadingPage />}>
                <RouterProvider router={router} />
              </Suspense>
            </AuthProvider>
          </ConfirmProvider>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

export default App
