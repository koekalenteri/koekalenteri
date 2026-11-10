import type { RouteObject } from 'react-router'
import type { Language } from '../../i18n'
import type { ConfirmedEvent, DogEvent, Registration } from '../../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { cleanup, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
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
import EventEditPage from './EventEditPage'
import EventStationsPage from './EventStationsPage'
import EventDetailsDialog from './eventViewPage/EventDetailsDialog'
import { adminEventRegistrationsAtom } from './state'
import { renderAdminRoutes } from './test-utils/adminRoutes'

vi.mock('../../api/user')
vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/location')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')

// The edit page subscribes to the event's viewers; no socket runs here.
vi.mock('../../hooks/useWebSocketContext', () => ({
  useWebSocketContext: () => ({ subscribeEvent: vi.fn(), unsubscribeEvent: vi.fn(), viewers: [] }),
}))

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
const renderSeeded = (event: DogEvent, registrations: Registration[], events: DogEvent[] = [event]) =>
  renderAdminRoutes({
    events,
    initialEntry: Path.admin.stations(event.id),
    initializeState: ({ set }) => set(adminEventRegistrationsAtom(event.id), registrations),
    routes: [
      { element: <EventStationsPage />, path: Path.admin.stations() },
      { element: <div>event view</div>, path: Path.admin.viewEvent() },
    ],
  })

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
    const DRAFT_KEY = `adminEditableEvent/stations/Id__${eventWithStations.id}`
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
      sessionStorage.setItem('adminEditableEvent/stations/Id__gone', JSON.stringify(draft))
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

  // A page left without an answer, by a reload or a closed tab, keeps its draft for its next opening.
  describe('an unsaved change left on the page (KOE-1700)', () => {
    // A past trial's details open read-only unless it is a draft, and with no payment time the form sets
    // one as it opens.
    const draftEvent: DogEvent = { ...eventWithStations, paymentTime: 'registration', state: 'draft' }
    const leavePostAdded = async (event: DogEvent = eventWithStations) => {
      const { user } = await renderSeeded(event, registrationsToEventWithStations)
      await flushPromises()
      const posts = screen.getAllByText(/^event\.station \d/).length
      await user.click(screen.getAllByRole('button', { name: 'event.stationAdd' })[0])
      await flushPromises()
      cleanup()
      return posts
    }

    it('is not offered for saving in the event details dialog', async () => {
      await leavePostAdded(draftEvent)

      await renderAdminRoutes({
        events: [draftEvent],
        initialEntry: Path.admin.viewEvent(draftEvent.id),
        initializeState: ({ set }) => set(adminEventRegistrationsAtom(draftEvent.id), registrationsToEventWithStations),
        routes: [{ element: <EventDetailsDialog eventId={draftEvent.id} open />, path: Path.admin.viewEvent() }],
      })
      await flushPromises()

      expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
    })

    it('is still there when the page opens again', async () => {
      const posts = await leavePostAdded()

      await renderSeeded(eventWithStations, registrationsToEventWithStations)
      await flushPromises()

      expect(screen.getAllByText(/^event\.station \d/)).toHaveLength(posts + 1)
      expect(screen.getByRole('button', { name: 'save' })).toBeEnabled()
    })

    it('is dropped when the event has been saved since', async () => {
      const posts = await leavePostAdded()
      const savedSince = { ...eventWithStations, modifiedAt: new Date(eventWithStations.modifiedAt.getTime() + 60_000) }

      await renderSeeded(savedSince, registrationsToEventWithStations)
      await flushPromises()

      expect(screen.getAllByText(/^event\.station \d/)).toHaveLength(posts)
      expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
    })

    it('is gone from the page once the event is saved on the edit page', async () => {
      const posts = await leavePostAdded(draftEvent)
      const saved = { ...draftEvent, modifiedAt: new Date(draftEvent.modifiedAt.getTime() + 60_000) }
      vi.mocked(putEvent).mockResolvedValueOnce(saved)

      const { user } = await renderAdminRoutes({
        events: [draftEvent],
        initialEntry: Path.admin.editEvent(draftEvent.id),
        initializeState: ({ set }) => set(adminEventRegistrationsAtom(draftEvent.id), registrationsToEventWithStations),
        routes: [
          { element: <EventEditPage />, path: Path.admin.editEvent() },
          { element: <EventStationsPage />, path: Path.admin.stations() },
          { element: <Link to={Path.admin.stations(draftEvent.id)}>posts</Link>, path: Path.admin.events },
        ],
      })
      await flushPromises()
      await user.type(screen.getByLabelText('event.description (locale.fi)'), 'Muutos')
      await flushPromises()
      await user.click(screen.getByRole('button', { name: 'save' }))
      await flushPromises()

      await user.click(screen.getByRole('link', { name: 'posts' }))
      await flushPromises()

      expect(screen.getAllByText(/^event\.station \d/)).toHaveLength(posts)
      expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
    })
  })

  // KOE-674: a group of a class the event dropped is named, and the next edit leaves it out of the save.
  it('names a stored group of a class the event no longer runs, and saves without it after an edit', async () => {
    vi.mocked(putEvent).mockResolvedValueOnce(eventWithStations)
    const dropped: ConfirmedEvent = {
      ...eventWithStations,
      rotations: [
        { class: 'ALO', exercises: [{ stationId: 'post-1' }] },
        { class: 'VOI', exercises: [{ stationId: 'post-1' }] },
      ],
    }
    const { user } = await renderSeeded(dropped, registrationsToEventWithStations)
    await flushPromises()

    expect(screen.getByText(/^event\.rotation\.error\.unknownClass/)).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'event.stationAdd' })[0])
    await flushPromises()
    expect(screen.queryByText(/^event\.rotation\.error\.unknownClass/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'save' }))
    await flushPromises()

    expect(putEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ rotations: [expect.objectContaining({ class: 'ALO' })] }),
      TEST_ID_TOKEN,
      undefined,
      undefined
    )
    expect(screen.getByText('event view')).toBeInTheDocument()
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

  // KOE-1736: a scoring setting kept from before the trial became an official NOWT is ignored by its
  // readers and has no editor here, so it is no reason to hold the save.
  it('saves an official NOWT past an exercise scoring left from before', async () => {
    const stale: ConfirmedEvent = { ...eventWithStations, exerciseScoring: { maxPoints: 25 } }
    const { user } = await renderSeeded(stale, registrationsToEventWithStations)
    await flushPromises()

    await user.click(screen.getAllByRole('button', { name: 'event.stationAdd' })[0])
    await flushPromises()

    expect(screen.queryByRole('checkbox', { name: 'event.exerciseHalfPoints' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'save' })).toBeEnabled()
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
