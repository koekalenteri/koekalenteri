import { ThemeProvider } from '@mui/material'
import CssBaseline from '@mui/material/CssBaseline'
import { StyledEngineProvider } from '@mui/material/styles'
import { Provider } from 'jotai'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './i18n'

import App from './App'
import theme from './assets/Theme'
import { registerServiceWorker, unregisterServiceWorker } from './serviceWorkerRegistration'

import './index.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('root element not found!')
}

const root = createRoot(container)
root.render(
  <StrictMode>
    <Provider>
      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <App />
        </ThemeProvider>
      </StyledEngineProvider>
    </Provider>
  </StrictMode>
)

if (process.env.REACT_APP_DISABLE_SERVICE_WORKER === 'true') {
  void unregisterServiceWorker()
} else {
  registerServiceWorker()
}
