import type { ConfirmedEvent, Language } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { cleanup, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { eventWithStaticDates } from '@/__mockData__/events'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { Path } from '@/routeConfig'
import { TestProvider } from '@/test-utils/AtomProvider'
import { describeInLanguage } from '@/test-utils/language'
import { DataMemoryRouter, flushPromises, renderSuspended, runPendingTimers, TEST_ID_TOKEN } from '@/test-utils/utils'
import AppSnackbarProvider from '../../components/AppSnackbarProvider'
import { idTokenAtom } from '../../state'
import { adminEventsAtom } from '../state'
import EventDetailsDialog from './EventDetailsDialog'

vi.mock('@/api/user')
vi.mock('@/api/event')
vi.mock('@/api/eventType')
vi.mock('@/api/judge')
vi.mock('@/api/location')
vi.mock('@/api/official')
vi.mock('@/api/organizer')
vi.mock('@/api/registration')

const named: ConfirmedEvent = { ...eventWithStaticDates, name: 'Kevätkoe', names: { en: 'Spring trial' } }
const finnishOnly: ConfirmedEvent = { ...eventWithStaticDates, name: 'Kevätkoe' }

const renderDialog = async (event: ConfirmedEvent, language: Language) => {
  await renderSuspended(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <TestProvider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminEventsAtom, [event])
          }}
        >
          <AppSnackbarProvider>
            <Suspense fallback={<div>loading...</div>}>
              <DataMemoryRouter
                initialEntries={[Path.admin.viewEvent(event.id)]}
                routes={[{ element: <EventDetailsDialog eventId={event.id} open />, path: Path.admin.viewEvent() }]}
              />
            </Suspense>
          </AppSnackbarProvider>
        </TestProvider>
      </LocalizationProvider>
    </ThemeProvider>
  )
  await flushPromises()
}

const title = () => screen.getByRole('heading', { level: 2 })

// The event's details open over the entry view titled with the trial's name, in English for a
// secretary browsing in English when the trial has an English name (KOE-1453).
describe('EventDetailsDialog', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    runPendingTimers()
    // The form keeps the event it edits in session storage; the next test opens its own.
    sessionStorage.clear()
  })
  afterAll(() => vi.useRealTimers())

  it('is titled with the Finnish name in a Finnish view', async () => {
    await renderDialog(named, 'fi')
    expect(title()).toHaveTextContent('Kevätkoe')
  })

  describeInLanguage('en', () => {
    it.each([
      ['its English name', named, 'Spring trial'],
      ['its Finnish name when it has no English one', finnishOnly, 'Kevätkoe'],
    ])('is titled with %s', async (_case, event, expected) => {
      await renderDialog(event, 'en')
      expect(title()).toHaveTextContent(expected)
    })
  })
})
