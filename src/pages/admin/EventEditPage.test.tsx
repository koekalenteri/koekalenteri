import type { RouteObject } from 'react-router'
import type { Language } from '../../i18n'
import type { DogEvent } from '../../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { cleanup, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '../../__mockData__/events'
import { putEvent } from '../../api/event'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises, renderSuspended, TEST_ID_TOKEN } from '../../test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import { idTokenAtom } from '../state'
import EventEditPage from './EventEditPage'
import { renderEditPage } from './test-utils/editPageRoutes'

vi.mock('../../api/user')
vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/location')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')

const mockSubscribeEvent = vi.fn()
const mockUnsubscribeEvent = vi.fn()
let mockViewers: Array<{ name: string; userId: string }> = []

vi.mock('../../hooks/useWebSocketContext', () => ({
  useWebSocketContext: () => ({
    subscribeEvent: mockSubscribeEvent,
    unsubscribeEvent: mockUnsubscribeEvent,
    viewers: mockViewers,
  }),
}))

describe('EventEditPage', () => {
  let consoleDebug: import('vitest').MockInstance<typeof console.debug>

  beforeAll(() => vi.useFakeTimers())
  beforeEach(() => {
    consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
  })
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    consoleDebug.mockRestore()
    mockSubscribeEvent.mockClear()
    mockUnsubscribeEvent.mockClear()
    mockViewers = []
  })
  afterAll(() => vi.useRealTimers())

  it('renders properly', async () => {
    const { i18n } = useTranslation()
    const language = i18n.language as Language

    const routes: RouteObject[] = [
      {
        element: <EventEditPage />,
        path: Path.admin.editEvent(),
      },
    ]

    const { unmount } = await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <DataMemoryRouter initialEntries={[Path.admin.editEvent(eventWithStaticDates.id)]} routes={routes} />
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(screen.getByLabelText('event.name (locale.fi)')).toHaveValue(eventWithStaticDates.name)
    expect(screen.getByRole('group', { name: 'event.startDate' })).toHaveTextContent('10.02.2021')
    unmount()
    expect(consoleDebug).toHaveBeenCalledTimes(2)
    expect(consoleDebug).toHaveBeenNthCalledWith(1, 'ws:event-subscription mount', { eventId: eventWithStaticDates.id })
    expect(consoleDebug).toHaveBeenNthCalledWith(2, 'ws:event-subscription cleanup', {
      eventId: eventWithStaticDates.id,
    })
  })

  it('subscribes to event viewers and shows viewer notification', async () => {
    mockViewers = [{ name: 'Other Admin', userId: 'other-admin' }]
    const { i18n } = useTranslation()
    const language = i18n.language as Language

    const routes: RouteObject[] = [
      {
        element: <EventEditPage />,
        path: Path.admin.editEvent(),
      },
    ]

    const { unmount } = await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <DataMemoryRouter initialEntries={[Path.admin.editEvent(eventWithStaticDates.id)]} routes={routes} />
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(mockSubscribeEvent).toHaveBeenCalledWith(eventWithStaticDates.id)
    expect(screen.getByRole('alert')).toHaveTextContent('event.viewerBanner_one count, names')

    unmount()

    expect(mockUnsubscribeEvent).toHaveBeenCalledTimes(1)
    expect(consoleDebug).toHaveBeenCalledTimes(2)
    expect(consoleDebug).toHaveBeenNthCalledWith(1, 'ws:event-subscription mount', { eventId: eventWithStaticDates.id })
    expect(consoleDebug).toHaveBeenNthCalledWith(2, 'ws:event-subscription cleanup', {
      eventId: eventWithStaticDates.id,
    })
  })

  // The ways out that do not ask. Whether leaving with a change asks is in EventEditPage.leave.test.tsx
  // (KOE-1700).
  describe('an unsaved change', () => {
    // A past trial's form is read-only unless it is a draft, and with no payment time the form sets one
    // as it opens.
    const editable: DogEvent = { ...eventWithStaticDates, paymentTime: 'registration', state: 'draft' }
    const EDIT_DRAFT_KEY = `adminEditableEvent/edit/Id__${editable.id}`
    const description = () => screen.getByLabelText('event.description (locale.fi)')

    const openPage = () => renderEditPage(editable)
    const change = async (user: Awaited<ReturnType<typeof openPage>>['user']) => {
      await user.type(description(), 'Muutos')
      await flushPromises()
    }

    afterEach(() => sessionStorage.clear())

    it('goes straight on with nothing changed', async () => {
      const { user } = await openPage()

      await user.click(screen.getByRole('link', { name: 'menu' }))
      await flushPromises()

      expect(screen.getByText('elsewhere')).toBeInTheDocument()
      expect(screen.queryByText('unsavedChanges.title')).not.toBeInTheDocument()
    })

    it('is discarded on cancel at once, without asking', async () => {
      const { user } = await openPage()
      await change(user)

      await user.click(screen.getByRole('button', { name: 'cancel' }))
      await flushPromises()

      expect(screen.queryByText('unsavedChanges.title')).not.toBeInTheDocument()
      expect(screen.getByText('event list')).toBeInTheDocument()
      expect(sessionStorage.getItem(EDIT_DRAFT_KEY)).toBeNull()
    })

    it('goes to the event list after a save, without asking', async () => {
      vi.mocked(putEvent).mockResolvedValueOnce(editable)
      const { user } = await openPage()
      await change(user)

      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expect(screen.queryByText('unsavedChanges.title')).not.toBeInTheDocument()
      expect(screen.getByText('event list')).toBeInTheDocument()
    })
  })

  // KOE-1736: the exercises' own scoring is a trial's that follows NOWT. The form removes it when the
  // trial stops following NOWT, and the save must carry the removal, or the server keeps the setting
  // (and refuses it beside the new format).
  describe("the exercises' own scoring", () => {
    const scored: DogEvent = {
      ...eventWithStaticDates,
      eventType: 'TEST1',
      exerciseScoring: { halfPoints: true, maxPoints: 30 },
      officialFormat: 'NOWT',
      paymentTime: 'registration',
      state: 'draft',
    }
    const formatField = () => screen.getByRole('combobox', { name: 'event.officialFormat' })
    const save = async (user: Awaited<ReturnType<typeof renderEditPage>>['user']) => {
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()
    }

    beforeEach(() => {
      vi.mocked(putEvent).mockResolvedValueOnce(scored)
    })
    afterEach(() => sessionStorage.clear())

    it('is removed by the save that makes the trial follow another format', async () => {
      const { user } = await renderEditPage(scored)

      await user.click(formatField())
      await user.click(screen.getByRole('option', { name: 'NOME-B' }))
      await flushPromises()
      await save(user)

      expect(putEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({ exerciseScoring: null, id: scored.id, officialFormat: 'NOME-B' }),
        TEST_ID_TOKEN,
        undefined,
        undefined
      )
    })

    it('is removed by the save that clears the format followed', async () => {
      const { user } = await renderEditPage(scored)

      await user.clear(formatField())
      await flushPromises()
      await save(user)

      expect(putEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({ exerciseScoring: null, id: scored.id, officialFormat: null }),
        TEST_ID_TOKEN,
        undefined,
        undefined
      )
    })
  })

  // KOE-1752: the day groups and the places per day are the form's own, edited and shown on it, so the
  // form moves them with the start as it moves the classes; the save carries them on the new days.
  describe('a start moved on the form', () => {
    const grouped: DogEvent = {
      ...eventWithStaticDates,
      dates: [
        { date: '2021-02-10', time: 'kp' },
        { date: '2021-02-11', time: 'ap' },
        { date: '2021-02-11', time: 'ip' },
      ],
      paymentTime: 'registration',
      places: 30,
      placesPerDay: { '2021-02-10': 10, '2021-02-11': 20 },
      state: 'draft',
    }

    type User = Awaited<ReturnType<typeof renderEditPage>>['user']
    /** The day pasted into a date field: a group of per-section spinbuttons, so into the first one. */
    const pasteDay = async (user: User, field: string, day: string) => {
      const section = screen.getByRole('group', { name: field }).querySelector<HTMLElement>('[role="spinbutton"]')
      if (!section) throw new Error(`${field} day section not found`)
      await user.click(section)
      await user.keyboard('{Control>}a{/Control}')
      await user.paste(day)
      await flushPromises()
    }
    const save = async (user: User) => {
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()
    }

    afterEach(() => sessionStorage.clear())

    it('saves the day groups and the places per day on the new days', async () => {
      vi.mocked(putEvent).mockResolvedValueOnce(grouped)
      const { user } = await renderEditPage(grouped)

      await pasteDay(user, 'event.startDate', '17.02.2021')
      await save(user)

      expect(putEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dates: [
            { date: '2021-02-17', time: 'kp' },
            { date: '2021-02-18', time: 'ap' },
            { date: '2021-02-18', time: 'ip' },
          ],
          endDate: '2021-02-18',
          placesPerDay: { '2021-02-10': null, '2021-02-11': null, '2021-02-17': 10, '2021-02-18': 20 },
          startDate: '2021-02-17',
        }),
        TEST_ID_TOKEN,
        undefined,
        undefined
      )
    })

    // The day groups' defaults fill only the day added: the moved days keep the groups chosen for them.
    it('keeps the groups of the moved days and gives a day added the defaults', async () => {
      vi.mocked(putEvent).mockResolvedValueOnce(grouped)
      const { user } = await renderEditPage(grouped)

      await pasteDay(user, 'event.startDate', '17.02.2021')
      await pasteDay(user, 'event.endDate', '19.02.2021')
      await save(user)

      expect(putEvent).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dates: [
            { date: '2021-02-17', time: 'kp' },
            { date: '2021-02-18', time: 'ap' },
            { date: '2021-02-18', time: 'ip' },
            { date: '2021-02-19', time: 'ap' },
            { date: '2021-02-19', time: 'ip' },
          ],
          endDate: '2021-02-19',
          placesPerDay: { '2021-02-10': null, '2021-02-11': null, '2021-02-17': 10, '2021-02-18': 20 },
          startDate: '2021-02-17',
        }),
        TEST_ID_TOKEN,
        undefined,
        undefined
      )
    })
  })

  // KOE-1736: the event selected on the list (kept in localStorage, shared by every tab) need not be the
  // one edited. The save is still a patch against the event the form edits: a whole event carries no
  // removals, and the server would keep every field the form cleared.
  describe('while the list has another event selected', () => {
    const following: DogEvent = {
      ...eventWithStaticDates,
      eventType: 'TEST1',
      officialFormat: 'NOWT',
      paymentTime: 'registration',
      state: 'draft',
    }
    const other: DogEvent = { ...eventWithStaticDates, id: 'other' }

    afterEach(() => sessionStorage.clear())

    it('sends a cleared field as a removal', async () => {
      vi.mocked(putEvent).mockResolvedValueOnce(following)
      const { user } = await renderEditPage(following, { others: [other], selected: other.id })

      await user.clear(screen.getByRole('combobox', { name: 'event.officialFormat' }))
      await flushPromises()
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expect(putEvent).toHaveBeenLastCalledWith(
        { id: following.id, modifiedAt: following.modifiedAt, officialFormat: null },
        TEST_ID_TOKEN,
        undefined,
        undefined
      )
    })
  })
})
