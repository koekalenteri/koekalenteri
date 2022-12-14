import { createRoot } from 'react-dom/client'
import { ThemeProvider, StyledEngineProvider, CssBaseline } from '@mui/material'
import "./index.css"
import "./i18n"
import App from './App'
import theme from './assets/Theme'
import reportWebVitals from './reportWebVitals'

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
