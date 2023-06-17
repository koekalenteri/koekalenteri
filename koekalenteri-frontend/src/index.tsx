import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material'
import CssBaseline from '@mui/material/CssBaseline'
import StyledEngineProvider from '@mui/material/StyledEngineProvider'
import { RecoilRoot } from 'recoil'

import './i18n'

import theme from './assets/Theme'
import { LoadingPage } from './pages/LoadingPage'
import App from './App'
import reportWebVitals from './reportWebVitals'

import './index.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('root element not found!')
}

const root = createRoot(container)
root.render(
  <StrictMode>
    <StyledEngineProvider injectFirst>
      <ThemeProvider theme={theme}>
        <RecoilRoot>
          <Suspense fallback={<LoadingPage />}>
            <CssBaseline />
            <App />
          </Suspense>
        </RecoilRoot>
      </ThemeProvider>
    </StyledEngineProvider>
  </StrictMode>
)

reportWebVitals()
