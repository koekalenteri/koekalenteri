import type { RouteObject } from 'react-router'
import type { Language } from '../../i18n'
import type { ConfirmedEvent, Registration } from '../../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { cleanup, screen } from '@testing-library/react'
import { ConfirmProvider } from 'material-ui-confirm'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '../../__mockData__/events'
import { eventWithStations, registrationsToEventWithStations } from '../../__mockData__/resultsEvent'
import { putEvent } from '../../api/event'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { expectConsoleOutput } from '../../test-utils/consoleGuard'
import { DataMemoryRouter, flushPromises, renderSuspendedWithUserEvents, TEST_ID_TOKEN } from '../../test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import { idTokenAtom } from '../state'
import EventStationsPage from './EventStationsPage'
import { adminEventRegistrationsAtom, adminEventsAtom } from './state'

vi.mock('../../api/user')
vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')

const renderPage = (language: Language, eventId = eventWithStaticDates.id) => {
  // A save sends the page to the event's view; without a route there the router logs a 404.
  const routes: RouteObject[] = [
    { element: <EventStationsPage />, path: Path.admin.stations() },
    { element: <div>event view</div>, path: Path.admin.viewEvent() },
  ]

  return renderSuspendedWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <Suspense fallback={<div>loading...</div>}>
            <AppSnackbarProvider>
              <DataMemoryRouter initialEntries={[Path.admin.stations(eventId)]} routes={routes} />
            </AppSnackbarProvider>
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
}

/** The page over an event and dogs of its own, seeded rather than read from the mocked API. */
const renderSeeded = (event: ConfirmedEvent, registrations: Registration[], events: ConfirmedEvent[] = [event]) =>
  renderSuspendedWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminEventsAtom, events)
            set(adminEventRegistrationsAtom(event.id), registrations)
          }}
        >
          <Suspense fallback={<div>loading...</div>}>
            <AppSnackbarProvider>
              <ConfirmProvider>
                <DataMemoryRouter
                  initialEntries={[Path.admin.stations(event.id)]}
                  routes={[
                    { element: <EventStationsPage />, path: Path.admin.stations() },
                    { element: <div>event view</div>, path: Path.admin.viewEvent() },
                  ]}
                />
              </ConfirmProvider>
            </AppSnackbarProvider>
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )

describe('EventStationsPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
    // The form keeps an unsaved edit in session storage, which would carry into the next test's page.
    sessionStorage.clear()
  })
  afterAll(() => vi.useRealTimers())

  it('finds the event and offers its posts for editing', async () => {
    const { i18n } = useTranslation()
    await renderPage(i18n.language as Language)
    await flushPromises()

    expect(screen.queryByText('error.eventNotFound')).not.toBeInTheDocument()
    // The mock event runs over two days, and a course is built per day.
    expect(screen.getAllByRole('button', { name: 'event.stationAdd' })).toHaveLength(2)
  })

  it('keeps the event after the first edit', async () => {
    const { i18n } = useTranslation()
    const { user } = await renderPage(i18n.language as Language)
    await flushPromises()

    await user.click(screen.getAllByRole('button', { name: 'event.stationAdd' })[0])
    await flushPromises()

    // The editor emits a patch. Storing that as the whole event would drop its id, and the page would
    // claim the event does not exist the moment anything was changed.
    expect(screen.queryByText('error.eventNotFound')).not.toBeInTheDocument()
    expect(screen.getByText('event.station 1')).toBeInTheDocument()
  })

  it("reports what it saved, not the event's publication state", async () => {
    const { i18n } = useTranslation()
    const { user } = await renderPage(i18n.language as Language)
    await flushPromises()

    await user.click(screen.getAllByRole('button', { name: 'event.stationAdd' })[0])
    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    // The shared form hook otherwise announces "event published", which is not what happened here.
    expect(screen.getByText('event.stationsSaved')).toBeInTheDocument()
  })

  describe('the head of the page (KOE-1699)', () => {
    const DRAFT_KEY = `adminEditableEvent/Id__${eventWithStations.id}`
    const trialLine = (name: string) =>
      new RegExp(`^dateFormat\\.datespan.* ${eventWithStations.eventType} ${eventWithStations.location} ${name}$`)
    const backLink = () => screen.getByRole('link', { name: 'results.backToEvent' })
    const postCount = () => screen.getAllByText(/^event\.station \d/).length
    const openPage = async () => {
      const rendered = await renderSeeded(eventWithStations, registrationsToEventWithStations)
      await flushPromises()
      return rendered
    }
    const addPost = async (user: Awaited<ReturnType<typeof renderSeeded>>['user']) => {
      await user.click(screen.getAllByRole('button', { name: 'event.stationAdd' })[0])
      await flushPromises()
    }

    it('says which trial this is and leads back to the event view', async () => {
      await openPage()

      expect(screen.getByText(trialLine(eventWithStations.name ?? ''))).toBeInTheDocument()
      expect(backLink()).toHaveAttribute('href', Path.admin.viewEvent(eventWithStations.id))
    })

    it('names the trial as stored, not as a waiting draft has it', async () => {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ ...eventWithStations, name: 'Luonnoksen nimi' }))
      await openPage()

      expect(screen.getByText(trialLine(eventWithStations.name ?? ''))).toBeInTheDocument()
      expect(screen.queryByText(/Luonnoksen nimi/)).not.toBeInTheDocument()
    })

    it('names the trial from the draft when no stored event is left to name it', async () => {
      const draft = { ...eventWithStations, id: 'gone', name: 'Vain luonnoksessa' }
      sessionStorage.setItem('adminEditableEvent/Id__gone', JSON.stringify(draft))
      await renderSeeded(draft, registrationsToEventWithStations, [])
      await flushPromises()

      expect(screen.getByText(/Vain luonnoksessa$/)).toBeInTheDocument()
    })

    it('goes straight back with nothing changed', async () => {
      const { user } = await openPage()

      await user.click(backLink())
      await flushPromises()

      expect(screen.getByText('event view')).toBeInTheDocument()
      expect(screen.queryByText('unsavedChanges.title')).not.toBeInTheDocument()
    })

    it('asks before leaving with a change, and staying keeps the page and the draft', async () => {
      const { user } = await openPage()
      const posts = postCount()
      await addPost(user)

      await user.click(backLink())
      await user.click(await screen.findByRole('button', { name: 'unsavedChanges.stay' }))
      await flushPromises()

      expect(screen.queryByText('event view')).not.toBeInTheDocument()
      expect(postCount()).toBe(posts + 1)
      expect(screen.getByRole('button', { name: 'save' })).toBeEnabled()
      expect(sessionStorage.getItem(DRAFT_KEY)).not.toBeNull()
    })

    it('leaves no draft behind when the answer is to leave', async () => {
      const { user } = await openPage()
      await addPost(user)
      expect(sessionStorage.getItem(DRAFT_KEY)).not.toBeNull()

      await user.click(backLink())
      await user.click(await screen.findByRole('button', { name: 'unsavedChanges.leave' }))
      await flushPromises()

      expect(screen.getByText('event view')).toBeInTheDocument()
      expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
    })

    it('discards the change on cancel at once, without asking', async () => {
      const { user } = await openPage()
      await addPost(user)

      await user.click(screen.getByRole('button', { name: 'cancel' }))
      await flushPromises()

      expect(screen.queryByText('unsavedChanges.title')).not.toBeInTheDocument()
      expect(screen.getByText('event view')).toBeInTheDocument()
      expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
    })

    it('goes to the event view after a save, without asking', async () => {
      vi.mocked(putEvent).mockResolvedValueOnce(eventWithStations)
      const { user } = await openPage()
      await addPost(user)

      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      expect(screen.queryByText('unsavedChanges.title')).not.toBeInTheDocument()
      expect(screen.getByText('event view')).toBeInTheDocument()
      expect(sessionStorage.getItem(DRAFT_KEY)).toBeNull()
    })

    it('stays on the page, still asking, after a refused save', async () => {
      expectConsoleOutput(/refused/)
      vi.mocked(putEvent).mockRejectedValueOnce(new Error('refused'))
      const { user } = await openPage()
      await addPost(user)

      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()
      await user.click(backLink())

      expect(await screen.findByRole('button', { name: 'unsavedChanges.stay' })).toBeInTheDocument()
    })
  })

  it('will not save two groups of one class that both hold every number (KOE-1665)', async () => {
    // ALO and AVO run the day; a third group goes with the last class, AVO, again without a range.
    const { user } = await renderSeeded(eventWithStations, registrationsToEventWithStations)
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'event.rotation.add' }))
    await user.click(screen.getByRole('button', { name: 'event.rotation.add' }))
    expect(screen.queryByText('event.rotation.errorsTitle')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'save' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'event.rotation.add' }))
    await flushPromises()

    expect(screen.getByText('event.rotation.errorsTitle')).toBeInTheDocument()
    expect(screen.getByText(/^event\.rotation\.error\.overlap/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
  })

  describe('a class split into number ranges (KOE-1665)', () => {
    // ALO runs dogs 1 and 2; the range 1 - 1 leaves dog 2 out.
    const split: ConfirmedEvent = {
      ...eventWithStations,
      rotations: [{ class: 'ALO', exercises: [{ stationId: 'post-1' }], firstNumber: 1, lastNumber: 1 }],
    }
    const [first, second, reserve] = registrationsToEventWithStations

    const editSomething = async (user: Awaited<ReturnType<typeof renderSeeded>>['user']) => {
      await user.click(screen.getAllByRole('button', { name: 'event.stationAdd' })[0])
      await flushPromises()
    }

    it('names a dog outside every range, and does not save', async () => {
      const { user } = await renderSeeded(split, registrationsToEventWithStations)
      await flushPromises()
      await editSomething(user)

      expect(screen.getByText(/^event\.rotation\.coverageOutside/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
    })

    it.each([
      ['a first number alone', { firstNumber: 1 }],
      ['a range the wrong way round', { firstNumber: 9, lastNumber: 1 }],
    ])('refuses %s, and does not save', async (_case, range) => {
      const { user } = await renderSeeded(
        { ...eventWithStations, rotations: [{ class: 'ALO', ...range, exercises: [{ stationId: 'post-1' }] }] },
        registrationsToEventWithStations
      )
      await flushPromises()
      await editSomething(user)

      expect(screen.getByText(/^event\.rotation\.error\.range/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
    })

    it("leaves no group behind when the day's only post is deleted, and saves", async () => {
      const onePost: ConfirmedEvent = {
        ...eventWithStations,
        rotations: [{ class: 'ALO', exercises: [{ stationId: 'post-1' }] }],
        stations: [eventWithStations.stations?.[0] ?? { date: eventWithStations.startDate, id: 'post-1', number: 1 }],
      }
      const { user } = await renderSeeded(onePost, registrationsToEventWithStations)
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'event.stationRemove' }))
      await flushPromises()

      expect(screen.queryByText('event.rotation.errorsTitle')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'save' })).toBeEnabled()
    })

    it('lets a type not scored at posts save past a stored rotation it never reads', async () => {
      const { user } = await renderSeeded({ ...split, eventType: 'NOME-B' }, registrationsToEventWithStations)
      await flushPromises()
      await editSomething(user)

      expect(screen.queryByText(/^event\.rotation\.coverageOutside/)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'save' })).toBeEnabled()
    })

    it('does not count a withdrawn dog or a reserve', async () => {
      const withdrawn = { ...second, cancelled: true }
      const { user } = await renderSeeded(split, [first, withdrawn, reserve])
      await flushPromises()
      await editSomething(user)

      expect(screen.queryByText('event.rotation.errorsTitle')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'save' })).toBeEnabled()
    })
  })
})
