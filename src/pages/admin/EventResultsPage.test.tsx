import type { UserEvent } from '@testing-library/user-event'
import type { RouteObject } from 'react-router'
import type { Language } from '../../i18n'
import type { EventResult } from '../../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { cleanup, screen, within } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '../../__mockData__/events'
import { eventWithStations, registrationsToEventWithStations } from '../../__mockData__/resultsEvent'
import { APIError } from '../../api/http'
import { putEventResults } from '../../api/registration'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises, renderWithUserEvents, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import EventResultsPage from './EventResultsPage'
import { adminEventRegistrationsAtom, adminEventsAtom } from './state'

vi.mock('../../api/user')
vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../api/judge')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')

const renderPage = (language: Language) => {
  const routes: RouteObject[] = [{ element: <EventResultsPage />, path: Path.admin.results() }]

  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <DataMemoryRouter initialEntries={[Path.admin.results(eventWithStaticDates.id)]} routes={routes} />
            </SnackbarProvider>
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
}

/**
 * The same page against a working test that has a course and dogs on it: two posts, one of them split
 * in two, and an entry list with a reserve in it. Everything the table itself does needs a round to do
 * it to, so the seeded atoms stand in for the event and its entries.
 */
const renderScoringPage = (language: Language, registrations = registrationsToEventWithStations) => {
  const routes: RouteObject[] = [{ element: <EventResultsPage />, path: Path.admin.results() }]

  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminEventsAtom, [eventWithStations])
            set(adminEventRegistrationsAtom(eventWithStations.id), registrations)
          }}
        >
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <DataMemoryRouter initialEntries={[Path.admin.results(eventWithStations.id)]} routes={routes} />
            </SnackbarProvider>
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
}

/**
 * The same page against a taipumuskoe: no posts and no tasks, so the result column is the entry — a
 * NOU is judged pass or fail, and there is nothing to derive either from.
 */
const renderQualitativePage = (
  language: Language,
  storedResults: Record<string, EventResult> = {},
  event = eventWithStaticDates
) => {
  const registrations = registrationsToEventWithStations.map((reg) => ({
    ...reg,
    class: undefined,
    eventId: event.id,
    eventResult: storedResults[reg.id],
    eventType: 'NOU',
  }))
  const routes: RouteObject[] = [{ element: <EventResultsPage />, path: Path.admin.results() }]

  return renderWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminEventsAtom, [event])
            set(adminEventRegistrationsAtom(event.id), registrations)
          }}
        >
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <DataMemoryRouter initialEntries={[Path.admin.results(event.id)]} routes={routes} />
            </SnackbarProvider>
          </Suspense>
        </Provider>
      </LocalizationProvider>
    </ThemeProvider>,
    undefined,
    { advanceTimers: vi.advanceTimersByTime }
  )
}

/** Enter a score and let the debounced change reach the page before anything else happens. */
const score = async (user: UserEvent, input: HTMLElement, points: string) => {
  await user.type(input, points)
  await flushPromises()
}

/** The table row a dog is scored on. The page's own controls answer the same queries as the cells'. */
const rowFor = (dogName: string): HTMLElement => {
  const row = screen.getByText(dogName).closest('tr')
  if (!row) throw new Error(`no row for ${dogName}`)
  return row
}

describe('EventResultsPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
  })
  afterAll(() => vi.useRealTimers())

  it('lists the dogs of a class with somewhere to record a result', async () => {
    const { i18n } = useTranslation()
    renderPage(i18n.language as Language)
    await flushPromises()

    expect(screen.queryByText('error.eventNotFound')).not.toBeInTheDocument()
    expect(screen.getByText('results.title')).toBeInTheDocument()
    // A result column exists even for an event type with no posts, which is the NOU and NOME-B case.
    expect(screen.getByText('results.column.result')).toBeInTheDocument()
  })

  it('has nothing to save until something is entered', async () => {
    const { i18n } = useTranslation()
    renderPage(i18n.language as Language)
    await flushPromises()

    expect(screen.getByRole('button', { name: 'results.save' })).toBeDisabled()
  })

  it('offers a way to record a round that was not scored', async () => {
    const { i18n } = useTranslation()
    renderPage(i18n.language as Language)
    await flushPromises()

    // A dog that is eliminated or withdrawn is common rather than exceptional, so the column exists
    // for every event type — the points grid alone could not record it.
    expect(screen.getByText('results.column.outcome')).toBeInTheDocument()
  })

  it('shows the koetunnus, so the secretary can see which event they are scoring', async () => {
    const { i18n } = useTranslation()
    renderPage(i18n.language as Language)
    await flushPromises()

    // KOE-72 asks for this outright: entering a whole class against the wrong event is a silent and
    // expensive mistake. The mock event has an id, so the header states it rather than offering the
    // lookup that stands in its place.
    expect(screen.getByText(/event\.kcId/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'event.kcIdLookup' })).not.toBeInTheDocument()
  })

  it('lists the dogs that ran, one row each, with a slot for every task in the round', async () => {
    const { i18n } = useTranslation()
    renderScoringPage(i18n.language as Language)
    await flushPromises()

    expect(screen.getByText('Ensimmainen')).toBeInTheDocument()
    expect(screen.getByText('Toinen')).toBeInTheDocument()
    // Post 2 splits its 20 points in two, so a two-post course is three scored slots, not two.
    expect(screen.getAllByText(/results\.column\.task/)).toHaveLength(3)
  })

  it('leaves out a reserve who never ran', async () => {
    const { i18n } = useTranslation()
    renderScoringPage(i18n.language as Language)
    await flushPromises()

    // The dog is entered and not cancelled, which is why filtering on cancellation alone let it
    // through: there is simply no round to record for it.
    expect(screen.queryByText('Varalla')).not.toBeInTheDocument()
  })

  it('shows the class tabs of the classes that have dogs', async () => {
    const { i18n } = useTranslation()
    renderScoringPage(i18n.language as Language)
    await flushPromises()

    expect(screen.getByRole('tab', { name: 'ALO' })).toBeInTheDocument()
    // AVO is on the event but nobody ran it, so there is nothing to score under it.
    expect(screen.queryByRole('tab', { name: 'AVO' })).not.toBeInTheDocument()
  })

  it('narrows to one post, and offers that post its own view', async () => {
    const { i18n } = useTranslation()
    const { user } = renderScoringPage(i18n.language as Language)
    await flushPromises()

    // The whole round is three slots; post 2 alone is the two it splits into.
    expect(screen.getAllByText(/results\.column\.task/)).toHaveLength(3)
    expect(screen.queryByRole('link', { name: 'results.openStationView' })).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('results.scope'))
    await user.click(screen.getByRole('option', { name: 'event.station 2' }))
    await flushPromises()

    expect(screen.getAllByText(/results\.column\.task/)).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'results.openStationView' })).toBeInTheDocument()
  })

  it('states a lone post judge rather than offering a choice', async () => {
    const { i18n } = useTranslation()
    renderScoringPage(i18n.language as Language)
    await flushPromises()

    // Post 1 names one judge, so there is nothing to choose; post 2 names none and falls back to the
    // class's, which is the same single judge.
    expect(screen.getAllByText('Tuomari 2').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('results.judge')).not.toBeInTheDocument()
  })

  it('derives the prize from what is on screen as it is typed', async () => {
    const { i18n } = useTranslation()
    const { user } = renderScoringPage(i18n.language as Language)
    await flushPromises()

    const row = rowFor('Ensimmainen')
    const [first, second, third] = within(row).getAllByRole('textbox')

    // The entry is debounced, so each score has to land before focus moves on — otherwise the blur
    // rewrites the field from a value the parent has not been told about yet.
    await score(user, first, '18')
    await score(user, second, '9')
    await score(user, third, '9')

    // 36 of 40 is 90 %, over the 80 % first-prize threshold, and the class prefixes the code.
    expect(screen.getByText('ALO1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'results.save' })).toBeEnabled()
  })

  it('asks why a task scored nothing, and will not let the zero stand unexplained', async () => {
    const { i18n } = useTranslation()
    const { user } = renderScoringPage(i18n.language as Language)
    await flushPromises()

    expect(screen.queryByLabelText('results.zeroFault')).not.toBeInTheDocument()

    await score(user, within(rowFor('Ensimmainen')).getAllByRole('textbox')[0], '0')

    // A zero without a reason is what would leave the series unable to answer the question it is
    // collected for, so the select opens in an error state until one is chosen.
    const fault = within(rowFor('Ensimmainen')).getByLabelText('results.zeroFault')
    expect(fault).toBeInTheDocument()
    expect(fault.closest('.MuiFormControl-root')?.querySelector('.Mui-error')).toBeTruthy()

    await user.click(fault)
    await user.click(screen.getByRole('option', { name: 'results.zeroFaults.eyeWipe' }))
    await flushPromises()

    expect(
      within(rowFor('Ensimmainen')).getByLabelText('results.zeroFault').closest('.MuiFormControl-root')
    ).not.toHaveClass('Mui-error')
  })

  it('voids the round on an eliminating fault and asks where it happened', async () => {
    const { i18n } = useTranslation()
    const { user } = renderScoringPage(i18n.language as Language)
    await flushPromises()

    expect(screen.queryByLabelText('results.outcomeAt')).not.toBeInTheDocument()

    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.outcome'))
    await user.click(screen.getByRole('option', { name: 'results.eliminatingFaults.hardMouth' }))
    await flushPromises()

    // Every elimination is a dash rather than a zero, and which post threw the dog out is worth
    // keeping rather than losing.
    expect(screen.getByText('ALO-')).toBeInTheDocument()
    expect(within(rowFor('Ensimmainen')).getByLabelText('results.outcomeAt')).toBeInTheDocument()
  })

  it('asks of a handler withdrawal only whether a prize was still in reach', async () => {
    const { i18n } = useTranslation()
    const { user } = renderScoringPage(i18n.language as Language)
    await flushPromises()

    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.outcome'))
    await user.click(screen.getByRole('option', { name: 'results.retirement.injury' }))
    await flushPromises()

    // An injured dog always takes the dash, so §5.8.1's question is not asked of it.
    expect(screen.queryByLabelText('results.couldStillHavePlaced')).not.toBeInTheDocument()

    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.outcome'))
    await user.click(screen.getByRole('option', { name: 'results.retirement.handlerChoice' }))
    await flushPromises()

    expect(screen.getByLabelText('results.couldStillHavePlaced')).toBeInTheDocument()
  })

  it('sends only the dogs that were actually scored', async () => {
    const { i18n } = useTranslation()
    const { user } = renderScoringPage(i18n.language as Language)
    await flushPromises()

    await score(user, within(rowFor('Ensimmainen')).getAllByRole('textbox')[0], '20')

    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    // The other dog was left untouched, and an empty row is not a result worth writing.
    expect(putEventResults).toHaveBeenCalledOnce()
    const [, submissions] = vi.mocked(putEventResults).mock.lastCall ?? []
    expect(submissions).toHaveLength(1)
    expect(submissions?.[0]).toMatchObject({ id: 'run-1' })
  })

  it("shows another post's stored scores and carries them along, so a correction does not erase them", async () => {
    const { i18n } = useTranslation()
    const storedAt = new Date('2021-02-13T10:00:00Z')
    const registrations = registrationsToEventWithStations.map((reg) =>
      reg.id === 'run-1'
        ? {
            ...reg,
            eventResult: {
              tasks: [{ index: 0, points: 17, stationId: 'post-1', updatedAt: storedAt, updatedBy: 'Rasti 1' }],
              updatedAt: storedAt,
              updatedBy: 'Rasti 1',
            },
          }
        : reg
    )
    const { user } = renderScoringPage(i18n.language as Language, registrations)
    await flushPromises()

    // The stored score seeds the row rather than leaving it blank: the whole-round save replaces the
    // task array, so a row starting blank would erase post-1's work the moment post-2 was entered.
    const inputs = within(rowFor('Ensimmainen')).getAllByRole('textbox')
    expect(inputs[0]).toHaveValue('17')

    await score(user, inputs[1], '8')
    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    const [, submissions] = vi.mocked(putEventResults).mock.lastCall ?? []
    expect(submissions?.[0].eventResult.tasks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ points: 17, stationId: 'post-1' }),
        expect.objectContaining({ points: 8, stationId: 'post-2' }),
      ])
    )
  })

  it('keeps only the disputed dogs on screen when the save comes back a conflict', async () => {
    const { i18n } = useTranslation()
    vi.mocked(putEventResults).mockRejectedValueOnce(
      new APIError(new Response(null, { status: 409, statusText: 'Conflict' }), {
        conflicts: [{ id: 'run-1', stored: { result: 'ALO2' }, submitted: { result: 'ALO1' } }],
        error: 'resultConflict',
        saved: [],
        unchanged: [],
      })
    )
    const { user } = renderScoringPage(i18n.language as Language)
    await flushPromises()

    await score(user, within(rowFor('Ensimmainen')).getAllByRole('textbox')[0], '20')
    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    // Losing a screenful of work to one contested dog would be its own bug, so the rest is already
    // written and only this one is put to the secretary.
    expect(screen.getByText('results.conflictTitle')).toBeInTheDocument()
    // Both versions are put side by side, since the secretary is the one who can tell them apart.
    expect(screen.getByRole('radio', { name: /results\.conflictStored/ })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /results\.conflictMine/ })).toBeInTheDocument()
    // Named, because a batch save can come back with several and "one of them" is not actionable.
    expect(within(screen.getByRole('dialog')).getByText('Ensimmainen')).toBeInTheDocument()
  })

  it('keeps the entered scores and says so when the save is refused', async () => {
    const { i18n } = useTranslation()
    // What the server answers for a dog that did not run: not a conflict, so there is nothing to
    // choose between and nothing the page can resolve on its own.
    vi.mocked(putEventResults).mockRejectedValueOnce(
      new APIError(new Response(null, { status: 422, statusText: 'Unprocessable' }), 'did not run')
    )
    const { user } = renderScoringPage(i18n.language as Language)
    await flushPromises()

    await score(user, within(rowFor('Ensimmainen')).getAllByRole('textbox')[0], '20')
    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    expect(screen.getByText('results.saveFailed')).toBeInTheDocument()
    expect(screen.queryByText('results.conflictTitle')).not.toBeInTheDocument()
    // The work stays on screen: the button merely stopping would read as a successful save.
    expect(screen.getByRole('button', { name: 'results.save' })).toBeEnabled()
  })

  it('sends back only the dogs the secretary overruled', async () => {
    const { i18n } = useTranslation()
    vi.mocked(putEventResults).mockRejectedValueOnce(
      new APIError(new Response(null, { status: 409, statusText: 'Conflict' }), {
        conflicts: [{ id: 'run-1', stored: { result: 'ALO2' }, submitted: { result: 'ALO1' } }],
        error: 'resultConflict',
        saved: [],
        unchanged: [],
      })
    )
    const { user } = renderScoringPage(i18n.language as Language)
    await flushPromises()

    await score(user, within(rowFor('Ensimmainen')).getAllByRole('textbox')[0], '20')
    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    await user.click(screen.getByRole('radio', { name: /results\.conflictMine/ }))
    await user.click(screen.getByRole('button', { name: 'results.conflictResolve' }))
    await flushPromises()

    // Sent again based on the version that beat it, so this save is no longer a conflict.
    expect(putEventResults).toHaveBeenCalledTimes(2)
    const [, submissions] = vi.mocked(putEventResults).mock.lastCall ?? []
    expect(submissions?.[0]).toMatchObject({ basedOn: undefined, id: 'run-1' })
    expect(screen.queryByText('results.conflictTitle')).not.toBeInTheDocument()
  })

  it('offers no scope selector for an event type that is not scored at posts', async () => {
    const { i18n } = useTranslation()
    renderPage(i18n.language as Language)
    await flushPromises()

    // The mock event is a NOU: there are no posts, so there is nothing to narrow to.
    expect(screen.queryByLabelText('results.scope')).not.toBeInTheDocument()
  })
})

describe('ResultCell', () => {
  it('derives the prize with the same module the server saves with', async () => {
    const { deriveNowtResult, formatEventResult, toScoredTasks } = await import('../../lib/results')
    const round = [
      { index: 0, maxPoints: 20, stationId: 'post-1' },
      { index: 0, maxPoints: 20, stationId: 'post-2' },
      { index: 0, maxPoints: 20, stationId: 'post-3' },
      { index: 0, maxPoints: 20, stationId: 'post-4' },
    ]
    const tasks = [17, 18, 16, 14].map((points, index) => ({ index: 0, points, stationId: `post-${index + 1}` }))

    // 65 of 80 is 81.25 %: a first prize, though 65 is the rules' second-prize number.
    const code = deriveNowtResult({ tasks: toScoredTasks(round, tasks) })

    expect(code && formatEventResult(code, 'NOWT', 'AVO')).toBe('AVO1')
  })
})

describe('conflict handling', () => {
  it('reads a conflict out of a rejected 409 rather than a returned value', async () => {
    const { APIError } = await import('../../api/http')

    // http throws on any non-ok response, so the conflicts arrive on the error, not as a result. A
    // page reading them off a resolved value would have a branch it never reaches.
    const response = new Response(null, { status: 409, statusText: 'Conflict' })
    const error = new APIError(response, {
      conflicts: [{ id: 'reg-1', stored: { result: 'AVO2' }, submitted: { result: 'AVO1' } }],
      error: 'resultConflict',
      saved: [],
      unchanged: [],
    })

    expect(error.status).toBe(409)
    expect(error.body).toMatchObject({ conflicts: [{ id: 'reg-1' }] })
  })
})

describe('a round that was not scored', () => {
  it('is a dash rather than a zero, whichever fault ended it', async () => {
    const { deriveNowtResult } = await import('../../lib/results')
    const tasks = [{ maxPoints: 20, points: 17, stationId: 'post-1' }]

    expect(deriveNowtResult({ elimination: { fault: 'harshHandling' }, tasks })).toBe('-')
    expect(deriveNowtResult({ retirement: { cause: 'injury' }, tasks })).toBe('-')
  })

  it("turns a handler's withdrawal on whether the dog was still in contention", async () => {
    const { deriveNowtResult } = await import('../../lib/results')
    const tasks = [{ maxPoints: 20, points: 17, stationId: 'post-1' }]

    expect(deriveNowtResult({ retirement: { cause: 'handlerChoice', couldStillHavePlaced: true }, tasks })).toBe('-')
    expect(deriveNowtResult({ retirement: { cause: 'handlerChoice', couldStillHavePlaced: false }, tasks })).toBe('0')
  })
})

describe('judge attribution', () => {
  it('carries the judge onto the score rather than asking again for every dog', async () => {
    const { mergeStationTasks } = await import('../../lib/results')
    const judge = { id: 1, name: 'Lappalainen Mika', official: true }

    // A post is manned by the same person all day, so the previous dog's judge is the likely answer
    // for the next one — the AC asks for it to be offered, not typed again.
    const scored = [{ index: 0, judge, points: 17, stationId: 'post-1', updatedAt: 'x', updatedBy: 'y' }]

    expect(mergeStationTasks(undefined, scored, 'post-1')[0].judge).toEqual(judge)
  })
})

describe('a pass/fail event type', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
  })
  afterAll(() => vi.useRealTimers())

  it('offers the codes the type can award, and sends the chosen one', async () => {
    const { i18n } = useTranslation()
    const { user } = renderQualitativePage(i18n.language as Language)
    await flushPromises()

    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))

    // A NOU is pass or fail: 1 or 0, and no dash — there is nothing to place against.
    expect(screen.getByRole('option', { name: 'NOU1' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'NOU0' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'NOU2' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'NOU-' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('option', { name: 'NOU1' }))
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    const [, submissions] = vi.mocked(putEventResults).mock.lastCall ?? []
    expect(submissions).toHaveLength(1)
    expect(submissions?.[0]).toMatchObject({ eventResult: { resultCode: '1' }, id: 'run-1' })
  })

  it('keeps the stored result when only the lisätieto changes', async () => {
    const { i18n } = useTranslation()
    const stored: EventResult = { result: 'NOU1', updatedAt: new Date('2026-08-30T10:00:00Z'), updatedBy: 'joku' }
    const { user } = renderQualitativePage(i18n.language as Language, { 'run-1': stored })
    await flushPromises()

    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.outcome'))
    await user.click(screen.getByRole('option', { name: 'results.retirement.injury' }))
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    // The edit only added the keskeytys; the recorded NOU1 must not fall off the save.
    const [, submissions] = vi.mocked(putEventResults).mock.lastCall ?? []
    expect(submissions?.[0]).toMatchObject({
      eventResult: { resultCode: '1', retirement: { cause: 'injury' } },
      id: 'run-1',
    })
  })

  it('shows the registration number beside the dog, as the AC lists it', async () => {
    const { i18n } = useTranslation()
    renderQualitativePage(i18n.language as Language)
    await flushPromises()

    expect(within(rowFor('Ensimmainen')).getByText('REG-run-1')).toBeInTheDocument()
  })

  it('states a lone event judge and attributes the result to them', async () => {
    const { i18n } = useTranslation()
    const { user } = renderQualitativePage(i18n.language as Language)
    await flushPromises()

    // One judge is a fact to state, not a choice to offer — same shape as a post's judge control.
    expect(within(rowFor('Ensimmainen')).getByText('Tuomari 1')).toBeInTheDocument()

    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))
    await user.click(screen.getByRole('option', { name: 'NOU1' }))
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    const [, submissions] = vi.mocked(putEventResults).mock.lastCall ?? []
    expect(submissions?.[0]).toMatchObject({
      eventResult: { judge: { id: 123, name: 'Tuomari 1' }, resultCode: '1' },
      id: 'run-1',
    })
  })

  it('offers a choice of judges when the event names several, and sends the chosen one', async () => {
    const { i18n } = useTranslation()
    const twoJudges = {
      ...eventWithStaticDates,
      judges: [
        { id: 123, name: 'Tuomari 1' },
        { id: 223, name: 'Tuomari 2' },
      ],
    }
    const { user } = renderQualitativePage(i18n.language as Language, {}, twoJudges)
    await flushPromises()

    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.judge'))
    await user.click(screen.getByRole('option', { name: 'Tuomari 2' }))
    await flushPromises()
    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))
    await user.click(screen.getByRole('option', { name: 'NOU0' }))
    await flushPromises()
    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    const [, submissions] = vi.mocked(putEventResults).mock.lastCall ?? []
    expect(submissions?.[0]).toMatchObject({
      eventResult: { judge: { id: 223, name: 'Tuomari 2' }, resultCode: '0' },
      id: 'run-1',
    })
  })

  it('discards the entered results on cancel rather than saving them', async () => {
    const { i18n } = useTranslation()
    const { user } = renderQualitativePage(i18n.language as Language)
    await flushPromises()

    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))
    await user.click(screen.getByRole('option', { name: 'NOU1' }))
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'cancel' }))
    await flushPromises()

    // The AC's secondary CTA: everything typed is dropped, and there is nothing left to save.
    expect(screen.getByRole('button', { name: 'results.save' })).toBeDisabled()
  })

  it('offers no result entry for a post-scored type, whose result is derived instead', async () => {
    const { i18n } = useTranslation()
    renderScoringPage(i18n.language as Language)
    await flushPromises()

    expect(within(rowFor('Ensimmainen')).queryByLabelText('results.column.result')).not.toBeInTheDocument()
  })
})
