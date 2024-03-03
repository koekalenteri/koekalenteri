import type { SnackbarKey } from 'notistack'

import { Suspense, useCallback } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Authenticator } from '@aws-amplify/ui-react'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { Amplify } from 'aws-amplify'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'
import { useRecoilValue } from 'recoil'

import { reportError } from './lib/client/rum'
import SnackbarCloseButton from './pages/components/SnackbarCloseButton'
import { LoadingPage } from './pages/LoadingPage'
import { languageAtom } from './pages/recoil'
import { AWSConfig } from './amplify-env'
import { locales, muiLocales } from './i18n'
import routes from './routes'

try {
  Amplify.configure(AWSConfig)
} catch (e) {
  reportError(e)
}

const router = createBrowserRouter(routes)

function App() {
  const language = useRecoilValue(languageAtom)
  const closeAction = useCallback((snackbarKey: SnackbarKey) => <SnackbarCloseButton snackbarKey={snackbarKey} />, [])

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
            <Authenticator.Provider>
              <Suspense fallback={<LoadingPage />}>
                <RouterProvider router={router} />
              </Suspense>
            </Authenticator.Provider>
          </ConfirmProvider>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

export default App
