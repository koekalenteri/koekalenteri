import type { TestStore } from '@/test-utils/AtomProvider'
import type { ConfirmedEvent, DogEvent, Language } from '@/types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { act, cleanup, fireEvent, screen } from '@testing-library/react'
import { Suspense, useState } from 'react'
import { eventWithStaticDates } from '@/__mockData__/events'
import { putEvent } from '@/api/event'
import theme from '@/assets/Theme'
import { locales } from '@/i18n'
import { Path } from '@/routeConfig'
import { TestProvider } from '@/test-utils/AtomProvider'
import { describeInLanguage } from '@/test-utils/language'
import {
  DataMemoryRouter,
  flushPromises,
  renderSuspended,
  renderSuspendedWithUserEvents,
  runPendingTimers,
  TEST_ID_TOKEN,
} from '@/test-utils/utils'
import AppSnackbarProvider from '../../components/AppSnackbarProvider'
import { idTokenAtom } from '../../state'
import { adminEventAtom, adminEventIdAtom, adminEventsAtom } from '../state'
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
// A past trial opens read-only unless it is a draft, and a form with no payment time sets one as it opens.
const editable: DogEvent = { ...named, paymentTime: 'registration', state: 'draft' }

const dialogTree = (event: DogEvent, language: Language, onClose?: () => void) => (
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
              routes={[
                {
                  element: <EventDetailsDialog eventId={event.id} onClose={onClose} open />,
                  path: Path.admin.viewEvent(),
                },
              ]}
            />
          </Suspense>
        </AppSnackbarProvider>
      </TestProvider>
    </LocalizationProvider>
  </ThemeProvider>
)

const renderDialog = async (event: DogEvent, language: Language) => {
  await renderSuspended(dialogTree(event, language))
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
    localStorage.clear()
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

  // Closing the dialog any way but Save is the Cancel it offers: the change is not kept for the next
  // opening, where it would wait unseen behind the stored details (KOE-1700).
  it.each([
    ['Esc', () => fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })],
    [
      'a click outside it',
      () => {
        const backdrop = document.querySelector('.MuiBackdrop-root')
        if (backdrop) fireEvent.click(backdrop)
      },
    ],
  ])('drops an unsaved change when closed with %s', async (_way, close) => {
    const onClose = vi.fn()
    const { user } = await renderSuspendedWithUserEvents(dialogTree(editable, 'fi', onClose), undefined, {
      advanceTimers: vi.advanceTimersByTime,
    })
    await flushPromises()
    await user.type(screen.getByLabelText('event.description (locale.fi)'), 'Muutos')
    await flushPromises()
    expect(screen.getByRole('button', { name: 'save' })).toBeEnabled()

    close()
    await flushPromises()
    expect(onClose).toHaveBeenCalledTimes(1)
    cleanup()

    await renderDialog(editable, 'fi')
    expect(screen.getByLabelText('event.description (locale.fi)')).toHaveValue(editable.description)
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
  })

  // The dialog sits on the event view from the start, closed. What it saves against is the event as it
  // was when the dialog opened, not when the view did (KOE-1700).
  it('saves against the event as another save left it before the dialog opened', async () => {
    let store: TestStore | undefined
    const savedElsewhere = { ...editable, modifiedAt: new Date(editable.modifiedAt.getTime() + 60_000) }
    vi.mocked(putEvent).mockResolvedValueOnce(savedElsewhere)
    const Toggled = () => {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            details
          </button>
          <EventDetailsDialog eventId={editable.id} onClose={() => setOpen(false)} open={open} />
        </>
      )
    }
    const { user } = await renderSuspendedWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <TestProvider
            initializeState={(initial) => {
              store = initial
              initial.set(idTokenAtom, TEST_ID_TOKEN)
              initial.set(adminEventsAtom, [editable])
              // The view selects its event, so a save sends only what changed.
              initial.set(adminEventIdAtom, editable.id)
            }}
          >
            <AppSnackbarProvider>
              <Suspense fallback={<div>loading...</div>}>
                <DataMemoryRouter
                  initialEntries={[Path.admin.viewEvent(editable.id)]}
                  routes={[{ element: <Toggled />, path: Path.admin.viewEvent() }]}
                />
              </Suspense>
            </AppSnackbarProvider>
          </TestProvider>
        </LocalizationProvider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()
    // The form loads its options when the dialog first opens; an awaited act lets that suspense finish.
    const openDetails = async () => {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'details' }))
      })
      await flushPromises()
    }

    await openDetails()
    await user.click(screen.getByRole('button', { name: 'cancel' }))
    await flushPromises()
    // Another secretary's save, as the socket brings it.
    await act(async () => store?.set(adminEventAtom(editable.id), savedElsewhere))
    await openDetails()
    await user.type(screen.getByLabelText('event.description (locale.fi)'), 'Muutos')
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(putEvent).toHaveBeenCalledWith(
      expect.objectContaining({ modifiedAt: savedElsewhere.modifiedAt }),
      TEST_ID_TOKEN,
      undefined,
      undefined
    )
  })
})
