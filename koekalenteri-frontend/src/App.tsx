import { useTranslation } from 'react-i18next'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { Auth } from '@aws-amplify/auth'
import { Authenticator } from '@aws-amplify/ui-react'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { ConfirmProvider } from 'material-ui-confirm'
import { SnackbarProvider } from 'notistack'

import { AWSConfig } from './amplify-env'
import { Language, locales, muiLocales } from './i18n'
import routes from './routes'

// import '@aws-amplify/ui-react/styles.css'

Auth.configure(AWSConfig)

const router = createBrowserRouter(routes)

function App() {
  const { i18n } = useTranslation()
  const language = i18n.language as Language

  return (
    <ThemeProvider theme={(outerTheme) => createTheme(outerTheme, muiLocales[language])}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <SnackbarProvider
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
          classes={{ containerRoot: 'snack' }}
          disableWindowBlurListener
          maxSnack={3}
        >
          <ConfirmProvider>
            <Authenticator.Provider>
              <RouterProvider router={router} />
            </Authenticator.Provider>
          </ConfirmProvider>
        </SnackbarProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

export default App
