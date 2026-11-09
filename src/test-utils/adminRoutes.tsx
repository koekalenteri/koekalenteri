import type { RouteObject } from 'react-router'
import type { Language } from '@/i18n'
import type { DogEvent } from '@/types'
import type { TestStore } from './AtomProvider'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { ConfirmProvider } from 'material-ui-confirm'
import { Suspense } from 'react'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { adminEventsAtom } from '@/pages/admin/state'
import AppSnackbarProvider from '@/pages/components/AppSnackbarProvider'
import { idTokenAtom } from '@/pages/state'
import { TestProvider } from './AtomProvider'
import { DataMemoryRouter, renderSuspendedWithUserEvents, TEST_ID_TOKEN } from './utils'

interface AdminRoutesOptions {
  /** The administrator's event list, as a fetch would have left it. */
  readonly events: DogEvent[]
  readonly initialEntry: string
  readonly routes: RouteObject[]
  readonly language?: Language
  /** Seeds more of the store after the signed-in token and the event list, or keeps hold of it. */
  readonly initializeState?: (store: TestStore) => void
}

/**
 * Admin routes as the app renders them: theme, date locale, a signed-in store holding the event list,
 * the snackbar and confirm providers, and a memory router, for a test with fake timers.
 */
export const renderAdminRoutes = ({
  events,
  initialEntry,
  routes,
  language = 'fi',
  initializeState,
}: AdminRoutesOptions) =>
  renderSuspendedWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <TestProvider
          initializeState={(store) => {
            store.set(idTokenAtom, TEST_ID_TOKEN)
            store.set(adminEventsAtom, events)
            initializeState?.(store)
          }}
        >
          <Suspense fallback={<div>loading...</div>}>
            <AppSnackbarProvider>
              <ConfirmProvider>
                <DataMemoryRouter initialEntries={[initialEntry]} routes={routes} />
              </ConfirmProvider>
            </AppSnackbarProvider>
          </Suspense>
        </TestProvider>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
