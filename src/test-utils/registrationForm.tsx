import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { Provider } from 'jotai'
import { Suspense } from 'react'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import AppSnackbarProvider from '../pages/components/AppSnackbarProvider'
import { createMatchMedia, runPendingTimers } from './utils'

/** The providers RegistrationForm reads, as the app gives them. */
export function RegistrationFormWrapper({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <Provider>
          <Suspense fallback={<div>loading...</div>}>
            <AppSnackbarProvider>{children}</AppSnackbarProvider>
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

/**
 * The clock and screen every RegistrationForm test file runs with, called in its outer describe: fake
 * timers started from the real time, and a wide screen, since jsdom has no matchMedia.
 */
export const setUpRegistrationFormTests = () => {
  beforeAll(() => {
    window.matchMedia = createMatchMedia(window.innerWidth)
    vi.useFakeTimers()
  })
  afterEach(runPendingTimers)
  afterAll(() => vi.useRealTimers())
}
