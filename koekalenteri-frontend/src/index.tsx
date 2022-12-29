import { createRoot } from 'react-dom/client'
import { CssBaseline, StyledEngineProvider, ThemeProvider } from '@mui/material'

import "./i18n"

import theme from './assets/Theme'
import App from './App'
import reportWebVitals from './reportWebVitals'

import "./index.css"

const container = document.getElementById('root')

if (!container) {
  throw new Error('root element not found!')
}

const root = createRoot(container)
root.render(
  <StyledEngineProvider injectFirst>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </StyledEngineProvider>,
)

reportWebVitals()
