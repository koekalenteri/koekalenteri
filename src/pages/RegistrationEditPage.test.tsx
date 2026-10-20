import type { ReactNode } from 'react'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { screen } from '@testing-library/react'
import { Provider } from 'jotai'
import { Suspense } from 'react'
import { MemoryRouter, useParams } from 'react-router'
import { eventWithStaticDates } from '../__mockData__/events'
import { registrationWithStaticDates } from '../__mockData__/registrations'
import * as eventApi from '../api/event'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { flushPromises, renderSuspended } from '../test-utils/utils'
import AppSnackbarProvider from './components/AppSnackbarProvider'
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
            <AppSnackbarProvider>
              <MemoryRouter>{children} </MemoryRouter>
            </AppSnackbarProvider>
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
  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.restoreAllMocks()
    // The event cache and its freshness live in storage: the next test reads its own event.
    localStorage.clear()
    sessionStorage.clear()
  })
  afterAll(() => vi.useRealTimers())

  it('should render', async () => {
    const { eventId, id } = registrationWithStaticDates
    mockUseParams.mockImplementation(() => ({ id: eventId, registrationId: id }))
    await renderSuspended(<RegistrationEditPage />, { wrapper: Wrapper })
    // One pass resolves the page's chained derived atoms; a second is needed for the
    // Collapse sections that only start their (now fake-timer-driven) exit transition once
    // that data has settled, matching the RegistrationListPage double-flush convention.
    await flushPromises()
    await flushPromises()
    expect(screen.getByRole('heading', { level: 1, name: 'entryEditTitle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'registration.cta.saveChanges' })).toBeInTheDocument()
    expect(screen.getByText(registrationWithStaticDates.handler?.name ?? 'UNDEFINED!')).toBeInTheDocument()
  })

  // One rule with the list page's menu and the server (KOE-1584): closed between the close of entry
  // and the trial, open again on the trial days, closed once the last day has gone or the class has
  // been judged. test1 runs 10.-11.2.2021; its entry closed on 7.2.
  it.each([
    ['while entry is open', '2021-02-05T12:00:00.000+02:00', 'confirmed', false],
    ['between the close of entry and the trial', '2021-02-08T12:00:00.000+02:00', 'invited', true],
    ['on the first day of an invited trial', '2021-02-10T12:00:00.000+02:00', 'invited', false],
    ['on the second day of a started trial', '2021-02-11T12:00:00.000+02:00', 'started', false],
    ['on the first day once the class has ended', '2021-02-10T12:00:00.000+02:00', 'ended', true],
    ['the day after the last day', '2021-02-12T00:00:01.000+02:00', 'started', true],
  ] as const)('locks the form %s: %s, %s', async (_label, now, state, locked) => {
    vi.setSystemTime(new Date(now))
    vi.spyOn(eventApi, 'getEvent').mockResolvedValue({ ...eventWithStaticDates, state })
    const { eventId, id } = registrationWithStaticDates
    mockUseParams.mockImplementation(() => ({ id: eventId, registrationId: id }))
    await renderSuspended(<RegistrationEditPage />, { wrapper: Wrapper })
    await flushPromises()
    await flushPromises()

    // The notes field sits in a collapsed section, which keeps it out of the accessibility tree.
    const notes = document.querySelector('textarea[name="notes"]')
    if (locked) expect(notes).toBeDisabled()
    else expect(notes).toBeEnabled()
  })
})
