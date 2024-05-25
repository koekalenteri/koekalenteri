import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '@mui/material'
import CssBaseline from '@mui/material/CssBaseline'
import StyledEngineProvider from '@mui/material/StyledEngineProvider'
import { RecoilEnv, RecoilRoot } from 'recoil'

import './i18n'

import theme from './assets/Theme'
import { isDevEnv } from './lib/env'
import App from './App'

import './index.css'

const container = document.getElementById('root')

if (!container) {
  throw new Error('root element not found!')
}

if (isDevEnv()) {
  // Recoil: disable "duplicate atom key" checking / logging in development. (Tests will log these)
  RecoilEnv.RECOIL_DUPLICATE_ATOM_KEY_CHECKING_ENABLED = false
}

const root = createRoot(container)
root.render(
  <StrictMode>
    <RecoilRoot>
      <StyledEngineProvider injectFirst>
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <App />
        </ThemeProvider>
      </StyledEngineProvider>
    </RecoilRoot>
  </StrictMode>
)
