import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { render } from '@testing-library/react'
import { Provider } from 'jotai'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter, useParams } from 'react-router'
import { registrationWithStaticDates } from '../__mockData__/registrations'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { flushPromises } from '../test-utils/utils'
import RegistrationEditPage from './RegistrationEditPage'

vi.mock('../api/user')
vi.mock('../api/event')
vi.mock('../api/eventType')
vi.mock('../api/judge')
vi.mock('../api/official')
vi.mock('../api/organizer')
vi.mock('../api/registration')

vi.mock('react-router', async () => ({
  ...(await vi.importActual<typeof import('react-router')>('react-router')),
  Link: vi.fn().mockImplementation(() => <>link</>),
  useNavigate: vi.fn(),
  useParams: vi.fn(),
}))
const mockUseParams = useParams as import('vitest').Mock

function Wrapper({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <Provider>
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <MemoryRouter>{children} </MemoryRouter>
            </SnackbarProvider>
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>
  )
}

describe('RegistrationEditPage', () => {
  // Also fake setTimeout/clearTimeout: MUI's Collapse sections resolve their exit transition via
  // a real setTimeout (react-transition-group), and flushPromises only awaits it deterministically
  // through vi.runOnlyPendingTimers() when timers are faked — otherwise it falls back to a real
  // 310ms wait that races the transition under load, flaking the snapshot.
  beforeAll(() => vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] }))
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('should render', async () => {
    const { eventId, id } = registrationWithStaticDates
    mockUseParams.mockImplementation(() => ({ id: eventId, registrationId: id }))
    const { container } = render(<RegistrationEditPage />, { wrapper: Wrapper })
    // One pass resolves the page's chained recoil selectors; a second is needed for the
    // Collapse sections that only start their (now fake-timer-driven) exit transition once
    // that data has settled, matching the RegistrationListPage double-flush convention.
    await flushPromises()
    await flushPromises()
    expect(container).toMatchSnapshot()
  })
})
