import type { UserEvent } from '@testing-library/user-event'
import type { RouteObject } from 'react-router'
import type { Language } from '../../i18n'
import type { KcDogReport } from '../../lib/kennelliittoResults'
import type { ConfirmedEvent, EventResult, Registration } from '../../types'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { cleanup, screen, within } from '@testing-library/react'
import { addDays } from 'date-fns'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '../../__mockData__/events'
import { eventWithStations, RESULTS_EVENT_DAY, registrationsToEventWithStations } from '../../__mockData__/resultsEvent'
import { putEvent, searchEventKcIdChoices } from '../../api/event'
import { APIError } from '../../api/http'
import {
  getRegistrations,
  handOverKennelliittoResults,
  previewKennelliittoResults,
  putEventResults,
  sendKennelliittoResults,
} from '../../api/registration'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { expectConsoleOutput } from '../../test-utils/consoleGuard'
import { describeInLanguage } from '../../test-utils/language'
import { DataMemoryRouter, flushPromises, renderSuspendedWithUserEvents, TEST_ID_TOKEN } from '../../test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import { idTokenAtom } from '../state'
import EventResultsPage from './EventResultsPage'
import { adminEventRegistrationsAtom, adminEventsAtom } from './state'

// Two release switches: the live entry link (KOE-1259) and the reason a round ended (KOE-1299). The
// tests describe both features with them on, and one test each checks what the switch alone takes away.
const features = vi.hoisted(() => ({ liveViewEnabled: true, outcomeReasonEnabled: true }))
vi.mock('../../lib/features', () => features)

vi.mock('../../api/user')
vi.mock('../../api/event')
vi.mock('../../api/eventType')
vi.mock('../../hooks/useEventSubscription', () => ({ useEventSubscription: vi.fn(() => ({ viewers: [] })) }))
vi.mock('../../api/judge')
vi.mock('../../api/official')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')

const renderPage = (language: Language) => {
  const routes: RouteObject[] = [{ element: <EventResultsPage />, path: Path.admin.results() }]

  return renderSuspendedWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <Suspense fallback={<div>loading...</div>}>
            <AppSnackbarProvider>
              <DataMemoryRouter initialEntries={[Path.admin.results(eventWithStaticDates.id)]} routes={routes} />
            </AppSnackbarProvider>
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

  return renderSuspendedWithUserEvents(
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
            <AppSnackbarProvider>
              <DataMemoryRouter initialEntries={[Path.admin.results(eventWithStations.id)]} routes={routes} />
            </AppSnackbarProvider>
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
  event: ConfirmedEvent = eventWithStaticDates,
  extra: Record<string, Partial<Registration>> = {},
  idToken: string = TEST_ID_TOKEN
) => {
  const registrations = registrationsToEventWithStations.map((reg) => ({
    ...reg,
    class: undefined,
    eventId: event.id,
    eventResult: storedResults[reg.id],
    eventType: 'NOU',
    ...extra[reg.id],
  }))
  const routes: RouteObject[] = [{ element: <EventResultsPage />, path: Path.admin.results() }]

  return renderSuspendedWithUserEvents(
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
        <Provider
          initializeState={({ set }) => {
            set(idTokenAtom, idToken)
            set(adminEventsAtom, [event])
            set(adminEventRegistrationsAtom(event.id), registrations)
          }}
        >
          <Suspense fallback={<div>loading...</div>}>
            <AppSnackbarProvider>
              <DataMemoryRouter initialEntries={[Path.admin.results(event.id)]} routes={routes} />
            </AppSnackbarProvider>
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

const firstCellText = (row: HTMLElement): string => row.querySelectorAll('td')[0]?.textContent ?? ''

/** The dog as the venue drew it: a frozen number that need not match the working order it entered with. */
const drawn = (registration: Registration, number: number): Registration => ({
  ...registration,
  startGroup: { ...registration.group, date: registration.group?.date, key: registration.group?.key ?? '', number },
})

const SECOND_DAY = addDays(RESULTS_EVENT_DAY, 1)

const onSecondDay = (registration: Registration): Registration => ({
  ...registration,
  group: { ...registration.group, date: SECOND_DAY, key: registration.group?.key ?? '', number: 1 },
})

/** The list of a trial's registrations as the page reads it again: the call without a cursor, which answers the whole list. */
const listRegistrations =
  vi.mocked<(eventId: string, token: string, signal?: AbortSignal) => Promise<Registration[]>>(getRegistrations)

describe('EventResultsPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
  })
  afterAll(() => vi.useRealTimers())

  it('lists the dogs of a class with somewhere to record a result', async () => {
    const { i18n } = useTranslation()
    await renderPage(i18n.language as Language)
    await flushPromises()

    expect(screen.queryByText('error.eventNotFound')).not.toBeInTheDocument()
    expect(screen.getByText('results.title')).toBeInTheDocument()
    // A result column exists even for an event type with no posts, which is the NOU and NOME-B case.
    expect(screen.getByText('results.column.result')).toBeInTheDocument()
  })

  it('has nothing to save until something is entered', async () => {
    const { i18n } = useTranslation()
    await renderPage(i18n.language as Language)
    await flushPromises()

    expect(screen.getByRole('button', { name: 'results.save' })).toBeDisabled()
  })

  it('has nothing to save again once a change is taken back', async () => {
    const { i18n } = useTranslation()
    const { user } = await renderScoringPage(i18n.language as Language)
    await flushPromises()
    const input = within(rowFor('Ensimmainen')).getAllByRole('textbox')[0]

    await score(user, input, '10')
    expect(screen.getByRole('button', { name: 'results.save' })).toBeEnabled()

    // Cleared again, the row is what is stored: nothing to save, and nothing to warn about leaving.
    await user.clear(input)
    await flushPromises()
    expect(screen.getByRole('button', { name: 'results.save' })).toBeDisabled()
  })

  it('takes a picked result back as no change for a qualitative type', async () => {
    const { i18n } = useTranslation()
    const { user } = await renderQualitativePage(i18n.language as Language)
    await flushPromises()

    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))
    await user.click(screen.getByRole('option', { name: 'NOU1' }))
    expect(screen.getByRole('button', { name: 'results.save' })).toBeEnabled()

    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))
    await user.click(screen.getByRole('option', { name: 'results.resultNone' }))
    expect(screen.getByRole('button', { name: 'results.save' })).toBeDisabled()
  })

  it("lets a judge's stop be recorded only beside the nought", async () => {
    const { i18n } = useTranslation()
    features.outcomeReasonEnabled = false
    try {
      const { user } = await renderQualitativePage(i18n.language as Language)
      await flushPromises()

      // A prize with "Kesk." beside it would say two things at once, so once a prize is picked the
      // interruption control is greyed out rather than offered (Minsu, KOE-1300).
      await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))
      await user.click(screen.getByRole('option', { name: 'NOU1' }))
      expect(within(rowFor('Ensimmainen')).getByLabelText('results.interruption')).toHaveAttribute(
        'aria-disabled',
        'true'
      )

      // The nought opens it again, and the stop is recorded beside it.
      await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))
      await user.click(screen.getByRole('option', { name: 'NOU0' }))
      await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.interruption'))
      await user.click(screen.getByRole('option', { name: 'results.retirement.judgeStopped' }))
      await flushPromises()
      expect(within(rowFor('Ensimmainen')).getByText('results.marks.interrupted')).toBeInTheDocument()

      // Picking a prize over a recorded stop takes the stop away with it, so the control never sits
      // greyed out while still showing one.
      await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))
      await user.click(screen.getByRole('option', { name: 'NOU1' }))
      await flushPromises()
      expect(within(rowFor('Ensimmainen')).queryByText('results.marks.interrupted')).not.toBeInTheDocument()
      expect(within(rowFor('Ensimmainen')).getByLabelText('results.interruption')).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    } finally {
      features.outcomeReasonEnabled = true
    }
  })

  it('offers a way to record a round that was not scored', async () => {
    const { i18n } = useTranslation()
    await renderPage(i18n.language as Language)
    await flushPromises()

    // A dog that is eliminated or withdrawn is common rather than exceptional, so the column exists
    // for every event type — the points grid alone could not record it.
    expect(screen.getByText('results.column.outcome')).toBeInTheDocument()
  })

  it('asks only whether the judge stopped the trial while the reason is switched off', async () => {
    const { i18n } = useTranslation()
    features.outcomeReasonEnabled = false
    try {
      const { user } = await renderScoringPage(i18n.language as Language)
      await flushPromises()

      await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.interruption'))

      // Recording *why* is KOE-1299 and still switched off, so the column narrows to the one question
      // the secretary can answer, and its heading narrows with it.
      const options = within(screen.getByRole('listbox')).getAllByRole('option')
      expect(options.map((option) => option.textContent)).toEqual([
        'results.notInterrupted',
        'results.retirement.judgeStopped',
      ])

      await user.click(screen.getByRole('option', { name: 'results.retirement.judgeStopped' }))
      await flushPromises()

      // A stop is published as the nought, with the mark beside it saying the trial ended early — the
      // shape the breeding database shows (ALO0, Kesk.).
      expect(within(rowFor('Ensimmainen')).getByText('ALO0')).toBeInTheDocument()
      expect(within(rowFor('Ensimmainen')).getByText('results.marks.interrupted')).toBeInTheDocument()
    } finally {
      features.outcomeReasonEnabled = true
    }
  })

  it('shows that the trial is linked to Kennelliitto, so the secretary can see which event they are scoring', async () => {
    const { i18n } = useTranslation()
    await renderPage(i18n.language as Language)
    await flushPromises()

    // KOE-72 asks for this outright: entering a whole class against the wrong event is a silent and
    // expensive mistake. The mock event is linked (it has a kcGuid), so the header says so rather than
    // offering the lookup that stands in its place.
    expect(screen.getByText('event.kcGuidLinked')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'event.kcIdLookup' })).not.toBeInTheDocument()
  })

  describe('an event without a GUID', () => {
    const legacy = {
      ...eventWithStaticDates,
      kcEvent: {
        classes: ['AVO'],
        endDate: eventWithStaticDates.endDate,
        eventType: 'NOU',
        judge: 'Tuomari A',
        judgeId: 1000001,
        location: 'Vantaa',
        startDate: eventWithStaticDates.startDate,
      },
      kcGuid: undefined,
    }

    it('shows its old koetunnus and offers the lookup', async () => {
      await renderQualitativePage('fi', {}, legacy)
      await flushPromises()

      expect(screen.getByText('event.kcIdLegacy id')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'event.kcIdLookup' })).toBeInTheDocument()
    })

    it('links the trial found, and sends null for every kcEvent field it lacks, so the old judge is not left behind', async () => {
      vi.mocked(searchEventKcIdChoices).mockResolvedValueOnce({
        choices: [
          {
            classes: ['ALO'],
            endDate: eventWithStaticDates.endDate,
            eventType: 'NOU',
            kcGuid: 'guid-b',
            name: '',
            organizer: 'Järjestäjä',
            startDate: eventWithStaticDates.startDate,
          },
        ],
      })
      const { user } = await renderQualitativePage('fi', {}, legacy)
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'event.kcIdLookup' }))
      await flushPromises()

      expect(putEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          kcEvent: expect.objectContaining({ classes: ['ALO'], judge: null, judgeId: null, location: null }),
          kcGuid: 'guid-b',
        }),
        expect.anything()
      )
    })
  })

  // The secretary browsing in English reads the trial's English name where one is kept (KOE-1453).
  it('names the trial in Finnish in a Finnish view', async () => {
    await renderQualitativePage('fi', {}, { ...eventWithStaticDates, name: 'Kevätkoe', names: { en: 'Spring trial' } })
    await flushPromises()

    expect(screen.getByText(/test location \(Kevätkoe\)$/)).toBeInTheDocument()
  })

  it('leaves the name out of the heading of a trial that has none', async () => {
    await renderQualitativePage('fi', {}, { ...eventWithStaticDates, name: '' })
    await flushPromises()

    expect(screen.getByText(/test location$/)).toBeInTheDocument()
  })

  describeInLanguage('en', () => {
    it.each([
      [
        'its English name',
        { ...eventWithStaticDates, name: 'Kevätkoe', names: { en: 'Spring trial' } },
        'Spring trial',
      ],
      ['its Finnish name when it has no English one', { ...eventWithStaticDates, name: 'Kevätkoe' }, 'Kevätkoe'],
    ])('names the trial by %s', async (_case, event, expected) => {
      await renderQualitativePage('en', {}, event)
      await flushPromises()

      expect(screen.getByText(new RegExp(String.raw`test location \(${expected}\)$`))).toBeInTheDocument()
    })
  })

  it('lists the dogs that ran, one row each, with a slot for every task in the round', async () => {
    const { i18n } = useTranslation()
    await renderScoringPage(i18n.language as Language)
    await flushPromises()

    expect(screen.getByText('Ensimmainen')).toBeInTheDocument()
    expect(screen.getByText('Toinen')).toBeInTheDocument()
    // Post 2 splits its 20 points in two, so a two-post course is three scored slots, not two.
    expect(screen.getAllByText(/results\.column\.task/)).toHaveLength(3)
  })

  it('leaves out a reserve who never ran', async () => {
    const { i18n } = useTranslation()
    await renderScoringPage(i18n.language as Language)
    await flushPromises()

    // The dog is entered and not cancelled, which is why filtering on cancellation alone let it
    // through: there is simply no round to record for it.
    expect(screen.queryByText('Varalla')).not.toBeInTheDocument()
  })

  it('shows the class tabs of the classes that have dogs', async () => {
    const { i18n } = useTranslation()
    await renderScoringPage(i18n.language as Language)
    await flushPromises()

    expect(screen.getByRole('tab', { name: 'ALO' })).toBeInTheDocument()
    // AVO is on the event but nobody ran it, so there is nothing to score under it.
    expect(screen.queryByRole('tab', { name: 'AVO' })).not.toBeInTheDocument()
  })

  it('narrows to one post, and offers that post its own view', async () => {
    const { i18n } = useTranslation()
    const { user } = await renderScoringPage(i18n.language as Language)
    await flushPromises()

    // The whole round is three slots; post 2 alone is the two it splits into.
    expect(screen.getAllByText(/results\.column\.task/)).toHaveLength(3)
    expect(screen.queryByRole('link', { name: 'results.openLiveEntry' })).not.toBeInTheDocument()

    await user.click(screen.getByLabelText('results.scope'))
    await user.click(screen.getByRole('option', { name: 'event.station 2' }))
    await flushPromises()

    expect(screen.getAllByText(/results\.column\.task/)).toHaveLength(2)
    expect(screen.getByRole('link', { name: 'results.openLiveEntry' })).toBeInTheDocument()
  })

  it('states a lone post judge rather than offering a choice', async () => {
    const { i18n } = useTranslation()
    await renderScoringPage(i18n.language as Language)
    await flushPromises()

    // Post 1 names one judge, so there is nothing to choose; post 2 names none and falls back to the
    // class's, which is the same single judge.
    expect(screen.getAllByText('Tuomari 2').length).toBeGreaterThan(0)
    expect(screen.queryByLabelText('results.judge')).not.toBeInTheDocument()
  })

  it('derives the prize from what is on screen as it is typed', async () => {
    const { i18n } = useTranslation()
    const { user } = await renderScoringPage(i18n.language as Language)
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
    const { user } = await renderScoringPage(i18n.language as Language)
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
    const { user } = await renderScoringPage(i18n.language as Language)
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
    const { user } = await renderScoringPage(i18n.language as Language)
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
    const { user } = await renderScoringPage(i18n.language as Language)
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
    const { user } = await renderScoringPage(i18n.language as Language, registrations)
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
    const { user } = await renderScoringPage(i18n.language as Language)
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
    // The refusal is reported as an error before the page tells the user; that is the report.
    expectConsoleOutput(/reportError .*422/)
    // The list read again after the refusal still has the dog.
    listRegistrations.mockResolvedValueOnce(registrationsToEventWithStations)
    const { user } = await renderScoringPage(i18n.language as Language)
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
    const { user } = await renderScoringPage(i18n.language as Language)
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
    await renderPage(i18n.language as Language)
    await flushPromises()

    // The mock event is a NOU: there are no posts, so there is nothing to narrow to.
    expect(screen.queryByLabelText('results.scope')).not.toBeInTheDocument()
  })

  it('offers a single-post format its one post without asking which', async () => {
    const { i18n } = useTranslation()
    await renderQualitativePage(i18n.language as Language)
    await flushPromises()

    // Nothing to narrow to, but the day is still run from the post: the clock and the queue live there.
    expect(screen.getByRole('link', { name: 'results.openLiveEntry' })).toHaveAttribute(
      'href',
      Path.admin.stationResults(eventWithStaticDates.id, '1')
    )
  })

  it('offers no way into the live entry view while the release switch is off', async () => {
    const { i18n } = useTranslation()
    features.liveViewEnabled = false
    try {
      await renderQualitativePage(i18n.language as Language)
      await flushPromises()

      expect(screen.queryByRole('link', { name: 'results.openLiveEntry' })).not.toBeInTheDocument()
    } finally {
      features.liveViewEnabled = true
    }
  })
})

describe('ResultSummary', () => {
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

  it('keeps a saved result on screen: the row re-seeds from what the server stored', async () => {
    const { i18n } = useTranslation()
    const { user } = await renderQualitativePage(i18n.language as Language)
    await flushPromises()
    const judge = { id: 223, name: 'Tuomari 2' }
    vi.mocked(putEventResults).mockResolvedValueOnce({
      conflicts: [],
      saved: [{ eventResult: { judge, result: 'NOU1', updatedAt: new Date(), updatedBy: 'x' }, id: 'run-1' }],
      unchanged: [],
    })

    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))
    await user.click(screen.getByRole('option', { name: 'NOU1' }))
    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    // Nothing is being edited any more, and the stored result is what the row shows.
    expect(screen.getByRole('button', { name: 'results.save' })).toBeDisabled()
    expect(within(rowFor('Ensimmainen')).getByLabelText('results.column.result')).toHaveTextContent('NOU1')
  })

  it('offers the codes the type can award, and sends the chosen one', async () => {
    const { i18n } = useTranslation()
    const { user } = await renderQualitativePage(i18n.language as Language)
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
    const { user } = await renderQualitativePage(i18n.language as Language, { 'run-1': stored })
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
    await renderQualitativePage(i18n.language as Language)
    await flushPromises()

    expect(within(rowFor('Ensimmainen')).getByText('REG-run-1')).toBeInTheDocument()
  })

  it('states a lone event judge and attributes the result to them', async () => {
    const { i18n } = useTranslation()
    const { user } = await renderQualitativePage(i18n.language as Language)
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
    const { user } = await renderQualitativePage(i18n.language as Language, {}, twoJudges)
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
    const { user } = await renderQualitativePage(i18n.language as Language)
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
    await renderScoringPage(i18n.language as Language)
    await flushPromises()

    expect(within(rowFor('Ensimmainen')).queryByLabelText('results.column.result')).not.toBeInTheDocument()
  })

  it('numbers the dogs by the drawn start number, not the working order (KOE-1353)', async () => {
    const { i18n } = useTranslation()
    // The draw put the second dog first: the row order and the number shown both follow it, because
    // the number on the collar is what the secretary reads off the sheet in front of them.
    await renderScoringPage(i18n.language as Language, [
      drawn(registrationsToEventWithStations[0], 12),
      drawn(registrationsToEventWithStations[1], 7),
    ])
    await flushPromises()

    expect(within(rowFor('Ensimmainen')).getByText('12')).toBeInTheDocument()
    expect(within(rowFor('Toinen')).getByText('7')).toBeInTheDocument()
    // The working-order numbers the dogs carried (1 and 2) are gone from the column.
    const numbers = screen.getAllByRole('row').slice(1).map(firstCellText)
    expect(numbers).toEqual(['7', '12'])
  })

  it('splits a multi-day class into its days (KOE-1353)', async () => {
    const { i18n } = useTranslation()
    const { user } = await renderScoringPage(i18n.language as Language, [
      registrationsToEventWithStations[0],
      onSecondDay(registrationsToEventWithStations[1]),
    ])
    await flushPromises()

    // The first day stands alone: the other day's dog is not on the sheet being scored.
    expect(screen.getByText('Ensimmainen')).toBeInTheDocument()
    expect(screen.queryByText('Toinen')).not.toBeInTheDocument()

    // The key-echoing translation mock gives both day buttons the same label, so the day itself picks it.
    const [, secondDay] = screen.getAllByRole('button', { name: 'dateFormat.wdshort date' })
    expect(secondDay).toHaveValue('2021-02-11')
    await user.click(secondDay)
    await flushPromises()

    expect(screen.getByText('Toinen')).toBeInTheDocument()
    expect(screen.queryByText('Ensimmainen')).not.toBeInTheDocument()
  })
})

describe('EventResultsPage and Kennelliitto (KOE-1140)', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    cleanup()
    vi.runOnlyPendingTimers()
  })
  afterAll(() => vi.useRealTimers())

  const noon = new Date('2021-02-10T12:00:00Z')
  const stored = (result: string, updatedAt = noon): EventResult => ({ result, updatedAt, updatedBy: 'Sihteeri' })
  const sentOk = {
    at: noon,
    by: 'Sihteeri',
    payloadHash: 'h',
    resultVersion: noon.toISOString(),
    status: 'sent' as const,
  }
  const dogReport = (
    id: string,
    status: 'blocked' | 'changed' | 'ready' | 'unchanged',
    problems: KcDogReport['problems'] = []
  ) => ({
    id,
    name: `Koira ${id}`,
    problems,
    regNo: `REG-${id}`,
    status,
  })

  /** A handled-over trial: Kennelliitto has it with the chief judge. */
  const handedOver = { ...eventWithStaticDates, kcState: { code: 1253, name: 'x', readAt: noon } }

  it('offers the sending for a format Kennelliitto knows', async () => {
    await renderQualitativePage('fi', { 'run-1': stored('NOU1') })
    await flushPromises()

    expect(screen.getByRole('button', { name: 'results.kennelliitto.send' })).toBeEnabled()
    expect(screen.getByText('results.kennelliitto.column')).toBeInTheDocument()
  })

  it('does not offer it for NOWT, whose placement does not exist yet', async () => {
    await renderScoringPage('fi')
    await flushPromises()

    expect(screen.queryByRole('button', { name: 'results.kennelliitto.send' })).not.toBeInTheDocument()
    expect(screen.queryByText('results.kennelliitto.column')).not.toBeInTheDocument()
  })

  it('shows where each dog stands beside it', async () => {
    await renderQualitativePage(
      'fi',
      { 'run-1': stored('NOU1'), 'run-2': stored('NOU0', new Date('2021-02-10T13:00:00Z')) },
      eventWithStaticDates,
      { 'run-1': { kcResult: sentOk }, 'run-2': { kcResult: sentOk } }
    )
    await flushPromises()

    // One was sent as it stands; the other was edited after it was sent.
    expect(within(rowFor('Ensimmainen')).getByText('results.kennelliitto.badge.sent')).toBeInTheDocument()
    expect(within(rowFor('Toinen')).getByText('results.kennelliitto.badge.changed')).toBeInTheDocument()
  })

  describe('the sending dialog', () => {
    it('asks the question and says the results can still be corrected until the hand-over', async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        dogs: [dogReport('run-1', 'ready')],
      })
      const { user } = await renderQualitativePage('fi', { 'run-1': stored('NOU1') })
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'results.kennelliitto.send' }))
      await flushPromises()

      expect(screen.getByText('results.kennelliitto.confirm')).toBeInTheDocument()
      expect(screen.getByText('results.kennelliitto.confirmNote')).toBeInTheDocument()
      // The sentence about no more editing belongs to the hand-over, not to the sending.
      expect(screen.queryByText('results.kennelliitto.handOver.confirm')).not.toBeInTheDocument()
      expect(previewKennelliittoResults).toHaveBeenCalledWith('test1', ['run-1', 'run-2'], expect.anything(), undefined)
    })

    it('lists what stops the trial and does not let it be sent', async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({
        blockers: [{ code: 'stateNotWritable', detail: 'Valmistunut' }],
        dogs: [],
      })
      const { user } = await renderQualitativePage('fi', { 'run-1': stored('NOU1') })
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'results.kennelliitto.send' }))
      await flushPromises()

      expect(screen.getByText('results.kennelliitto.blocker.stateNotWritable detail')).toBeInTheDocument()
      const dialog = within(screen.getByRole('dialog'))
      expect(dialog.getByRole('button', { name: 'results.kennelliitto.send' })).toBeDisabled()
    })

    it('names the dogs that cannot be sent, with the reason', async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        dogs: [dogReport('run-1', 'ready'), dogReport('run-2', 'blocked', [{ code: 'noJudge' }])],
      })
      const { user } = await renderQualitativePage('fi', { 'run-1': stored('NOU1') })
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'results.kennelliitto.send' }))
      await flushPromises()

      expect(screen.getByText(/Koira run-2 \(REG-run-2\): results.kennelliitto.problem.noJudge/)).toBeInTheDocument()
    })

    it('sends the dogs ten at a time and reports who was saved and who was refused, in Kennelliitto’s words', async () => {
      const ids = Array.from({ length: 12 }, (_unused, index) => `dog-${index}`)
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        dogs: ids.map((id) => dogReport(id, 'ready')),
      })
      vi.mocked(sendKennelliittoResults)
        .mockResolvedValueOnce({
          blockers: [],
          kcResults: [],
          notAttempted: [],
          reports: ids
            .slice(0, 10)
            .map((id) => ({ id, name: `Koira ${id}`, outcome: 'sent' as const, regNo: `REG-${id}` })),
        })
        .mockResolvedValueOnce({
          blockers: [],
          kcResults: [],
          notAttempted: [],
          reports: [
            { id: 'dog-10', name: 'Koira dog-10', outcome: 'sent' as const, regNo: 'REG-dog-10' },
            {
              errors: ['Koiran nimi ei täsmää.'],
              id: 'dog-11',
              name: 'Koira dog-11',
              outcome: 'failed' as const,
              regNo: 'REG-dog-11',
              status: 400,
            },
          ],
        })
      const { user } = await renderQualitativePage('fi', { 'run-1': stored('NOU1') })
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'results.kennelliitto.send' }))
      await flushPromises()
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.send' }))
      // Two requests, one after the other: each answer settles the page's state before the next goes.
      await flushPromises()
      await flushPromises()

      expect(sendKennelliittoResults).toHaveBeenNthCalledWith(1, 'test1', ids.slice(0, 10), false, expect.anything())
      expect(sendKennelliittoResults).toHaveBeenNthCalledWith(2, 'test1', ids.slice(10), false, expect.anything())
      expect(screen.getByText('results.kennelliitto.success count')).toBeInTheDocument()
      expect(screen.getByText('results.kennelliitto.failure count')).toBeInTheDocument()
      expect(screen.getByText('Koira dog-11 (REG-dog-11): Koiran nimi ei täsmää.')).toBeInTheDocument()
    })

    it('reads the state from the server instead of reporting a failure when the answer never came', async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({ blockers: [], dogs: [dogReport('run-1', 'ready')] })
      vi.mocked(sendKennelliittoResults).mockRejectedValueOnce(new Error('Network Error'))
      const { user } = await renderQualitativePage('fi', { 'run-1': stored('NOU1') })
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'results.kennelliitto.send' }))
      await flushPromises()
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.send' }))
      await flushPromises()

      // The page's list is the server's now (the mock holds none for this trial), not what it believed.
      expect(screen.queryByText('Ensimmainen')).not.toBeInTheDocument()
      expect(screen.getByText('results.kennelliitto.interrupted')).toBeInTheDocument()
      expect(screen.queryByText('results.kennelliitto.failure count')).not.toBeInTheDocument()
    })
  })

  describe('the answers of a sending', () => {
    const sendOnePage = async () => {
      vi.mocked(previewKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        dogs: [dogReport('run-1', 'ready'), dogReport('run-2', 'ready')],
      })
      const { user } = await renderQualitativePage('fi', { 'run-1': stored('NOU1') })
      await flushPromises()
      await user.click(screen.getByRole('button', { name: 'results.kennelliitto.send' }))
      await flushPromises()
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.send' }))
      await flushPromises()
      await flushPromises()
    }
    const sent = (id: string) => ({ id, name: `Koira ${id}`, outcome: 'sent' as const, regNo: `REG-${id}` })

    it('shows a dog that was sent as sent at once, from the answer, without reading the registrations again', async () => {
      vi.mocked(sendKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        kcResults: [
          {
            id: 'run-1',
            kcResult: {
              at: noon.toISOString(),
              by: 'Sihteeri',
              payloadHash: 'h',
              resultVersion: noon.toISOString(),
              status: 'sent',
            },
          },
        ],
        notAttempted: [],
        reports: [sent('run-1'), sent('run-2')],
      })

      await sendOnePage()

      expect(within(rowFor('Ensimmainen')).getByText('results.kennelliitto.badge.sent')).toBeInTheDocument()
    })

    it('asks again for the dogs a request had no time for, once it got somewhere', async () => {
      vi.mocked(sendKennelliittoResults)
        .mockResolvedValueOnce({ blockers: [], kcResults: [], notAttempted: ['run-2'], reports: [sent('run-1')] })
        .mockResolvedValueOnce({ blockers: [], kcResults: [], notAttempted: [], reports: [sent('run-2')] })

      await sendOnePage()

      expect(sendKennelliittoResults).toHaveBeenCalledTimes(2)
      expect(sendKennelliittoResults).toHaveBeenNthCalledWith(2, 'test1', ['run-2'], false, expect.anything())
      expect(screen.getByText('results.kennelliitto.success count')).toBeInTheDocument()
      expect(screen.queryByText('results.kennelliitto.notAttempted count')).not.toBeInTheDocument()
    })

    it('does not ask again when the request got nowhere, and says which dogs were left', async () => {
      vi.mocked(sendKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        kcResults: [],
        notAttempted: ['run-1', 'run-2'],
        reports: [],
      })

      await sendOnePage()

      expect(sendKennelliittoResults).toHaveBeenCalledTimes(1)
      expect(screen.getByText('results.kennelliitto.notAttempted count')).toBeInTheDocument()
    })

    it('says what stopped the trial when the server refuses it as blocked, and sends no more', async () => {
      vi.mocked(sendKennelliittoResults).mockRejectedValueOnce(
        new APIError(new Response(null, { status: 409 }), { blockers: [{ code: 'handedOver' }], error: 'blocked' })
      )

      await sendOnePage()

      expect(screen.getByText('results.kennelliitto.blocker.handedOver detail')).toBeInTheDocument()
      expect(screen.queryByText('results.kennelliitto.interrupted')).not.toBeInTheDocument()
    })

    it('says which dogs it did not send, with where they stood', async () => {
      vi.mocked(sendKennelliittoResults).mockResolvedValueOnce({
        blockers: [],
        kcResults: [],
        notAttempted: [],
        reports: [
          sent('run-1'),
          {
            dogStatus: 'blocked',
            id: 'run-2',
            name: 'Koira run-2',
            outcome: 'skipped',
            problems: [{ code: 'noJudge' }],
            regNo: 'REG-run-2',
          },
        ],
      })

      await sendOnePage()

      expect(screen.getByText('results.kennelliitto.skipped count')).toBeInTheDocument()
      expect(
        screen.getByText('Koira run-2 (REG-run-2): results.kennelliitto.problem.noJudge detail')
      ).toBeInTheDocument()
    })
  })

  describe('what a hand-over answers', () => {
    const openHandOver = async () => {
      const { user } = await renderQualitativePage('fi', { 'run-1': stored('NOU1') }, eventWithStaticDates, {
        'run-1': { kcResult: sentOk },
      })
      await flushPromises()
      await user.click(screen.getAllByRole('button', { name: 'results.kennelliitto.handOverButton' })[0])
      await flushPromises()
      const dialog = within(screen.getByRole('dialog'))
      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' }))
      await flushPromises()
      return { dialog, user }
    }
    const refusal = (status: number, body: ConstructorParameters<typeof APIError>[1]) =>
      vi.mocked(handOverKennelliittoResults).mockRejectedValueOnce(new APIError(new Response(null, { status }), body))

    it('lists what stops the trial', async () => {
      refusal(409, { blockers: [{ code: 'stateNotWritable', detail: 'Valmistunut' }], error: 'blocked' })

      const { dialog } = await openHandOver()

      expect(dialog.getByText('results.kennelliitto.blocker.stateNotWritable detail')).toBeInTheDocument()
    })

    it('lists the results that have to be sent first', async () => {
      refusal(409, { dogs: [dogReport('run-2', 'ready')], error: 'unsentResults' })

      const { dialog } = await openHandOver()

      expect(dialog.getByText('results.kennelliitto.handOver.unsent')).toBeInTheDocument()
      expect(dialog.getByText('Koira run-2 (REG-run-2): results.kennelliitto.dogStatus.ready')).toBeInTheDocument()
    })

    it('gives Kennelliitto’s reasons when it refuses the hand-over', async () => {
      refusal(502, { error: 'kennelliittoRefused', status: 400, virheet: ['Tila ei kelpaa.'] })

      const { dialog } = await openHandOver()

      expect(dialog.getByText('results.kennelliitto.handOver.refused reasons')).toBeInTheDocument()
    })

    it('says it is not known whether it happened when Kennelliitto gave no reasons', async () => {
      refusal(502, { error: 'kennelliittoRefused', status: 0 })

      const { dialog } = await openHandOver()

      expect(dialog.getByText('results.kennelliitto.handOver.unknown')).toBeInTheDocument()
      expect(dialog.queryByText('results.kennelliitto.handOver.refused reasons')).not.toBeInTheDocument()
    })

    it('asks for the secretary’s word before handing over nothing, and then hands over', async () => {
      refusal(409, { error: 'nothingSent' })

      const { dialog, user } = await openHandOver()
      expect(dialog.getByText('results.kennelliitto.handOver.nothingSent')).toBeInTheDocument()
      expect(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' })).toBeDisabled()

      await user.click(dialog.getByRole('checkbox'))
      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' }))
      await flushPromises()

      expect(handOverKennelliittoResults).toHaveBeenLastCalledWith('test1', true, expect.anything())
    })

    it('says it is done and closes when the trial is handed over', async () => {
      await openHandOver()

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByText('results.kennelliitto.handOver.done')).toBeInTheDocument()
    })
  })

  describe('a trial that has been sent but not handed over', () => {
    it('keeps asking for the hand-over on the page', async () => {
      const { user } = await renderQualitativePage('fi', { 'run-1': stored('NOU1') }, eventWithStaticDates, {
        'run-1': { kcResult: sentOk },
      })
      await flushPromises()

      expect(screen.getByText('results.kennelliitto.sentNotHandedOver count')).toBeInTheDocument()
      await user.click(screen.getAllByRole('button', { name: 'results.kennelliitto.handOverButton' })[0])
      await flushPromises()

      // The hand-over is where the secretary is told they can no longer edit.
      expect(screen.getByText('results.kennelliitto.handOver.confirm')).toBeInTheDocument()
      expect(screen.getByText('results.kennelliitto.handOver.certificates')).toBeInTheDocument()
    })

    it('lists the dogs that stay out and hands over once the secretary accepts them', async () => {
      vi.mocked(handOverKennelliittoResults).mockRejectedValueOnce(
        new APIError(new Response(null, { status: 409 }), {
          dogs: [dogReport('run-2', 'blocked', [{ code: 'noResult' }])],
          error: 'confirmationNeeded',
        })
      )
      const { user } = await renderQualitativePage('fi', { 'run-1': stored('NOU1') }, eventWithStaticDates, {
        'run-1': { kcResult: sentOk },
      })
      await flushPromises()
      await user.click(screen.getAllByRole('button', { name: 'results.kennelliitto.handOverButton' })[0])
      await flushPromises()
      const dialog = within(screen.getByRole('dialog'))

      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' }))
      await flushPromises()
      expect(dialog.getByText('results.kennelliitto.handOver.leftOut')).toBeInTheDocument()
      expect(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' })).toBeDisabled()

      await user.click(dialog.getByRole('checkbox'))
      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' }))
      await flushPromises()

      expect(handOverKennelliittoResults).toHaveBeenNthCalledWith(1, 'test1', false, expect.anything())
      expect(handOverKennelliittoResults).toHaveBeenNthCalledWith(2, 'test1', true, expect.anything())
    })
  })

  describe('a trial handed to the chief judge', () => {
    it('cannot be edited or sent, and says why', async () => {
      await renderQualitativePage('fi', { 'run-1': stored('NOU1') }, handedOver)
      await flushPromises()

      expect(screen.getByText('results.kennelliitto.locked')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'results.save' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'results.kennelliitto.send' })).toBeDisabled()
    })

    it('reads the state afresh, so a trial the judge sent back opens again', async () => {
      const { user } = await renderQualitativePage('fi', { 'run-1': stored('NOU1') }, handedOver)
      await flushPromises()
      vi.mocked(previewKennelliittoResults).mockClear()

      await user.click(screen.getByRole('button', { name: 'results.kennelliitto.refreshState' }))
      await flushPromises()

      expect(previewKennelliittoResults).toHaveBeenCalledWith('test1', [], expect.anything(), undefined)
    })
  })

  it('says the results are locked when a save finds the trial handed over from elsewhere', async () => {
    vi.mocked(putEventResults).mockRejectedValueOnce(
      new APIError(new Response(null, { status: 423 }), { error: 'resultsLocked' })
    )
    const { user } = await renderQualitativePage('fi', {})
    await flushPromises()
    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))
    await user.click(screen.getByRole('option', { name: 'NOU1' }))
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    expect(screen.getByText('results.kennelliitto.lockedSave')).toBeInTheDocument()
  })
  it('folds in the dogs a refused batch had saved before the lock, and takes them off the screen, before it reads the state', async () => {
    vi.mocked(putEventResults).mockRejectedValueOnce(
      new APIError(new Response(null, { status: 423 }), {
        conflicts: [],
        error: 'resultsLocked',
        saved: [{ eventResult: { result: 'NOU1', updatedAt: noon, updatedBy: 'Sihteeri' }, id: 'run-1' }],
        unchanged: [],
      })
    )
    vi.mocked(previewKennelliittoResults).mockClear()
    const { user } = await renderQualitativePage('fi', {})
    await flushPromises()
    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))
    await user.click(screen.getByRole('option', { name: 'NOU1' }))
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    // The dog is stored as the server says, and nothing of it is left to save.
    expect(within(rowFor('Ensimmainen')).getByLabelText('results.column.result')).toHaveTextContent('NOU1')
    expect(screen.getByRole('button', { name: 'results.save' })).toBeDisabled()
    expect(previewKennelliittoResults).toHaveBeenCalledWith('test1', [], expect.anything(), undefined)
  })

  it('folds in a dog the batch found stored already, and takes it off the screen, when it finds the trial locked', async () => {
    vi.mocked(putEventResults).mockRejectedValueOnce(
      new APIError(new Response(null, { status: 423 }), {
        conflicts: [],
        error: 'resultsLocked',
        saved: [],
        unchanged: [{ eventResult: { result: 'NOU1', updatedAt: noon, updatedBy: 'Sihteeri' }, id: 'run-1' }],
      })
    )
    const { user } = await renderQualitativePage('fi', {})
    await flushPromises()
    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))
    await user.click(screen.getByRole('option', { name: 'NOU1' }))
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    expect(within(rowFor('Ensimmainen')).getByLabelText('results.column.result')).toHaveTextContent('NOU1')
    expect(screen.getByRole('button', { name: 'results.save' })).toBeDisabled()
  })

  it('reads the state of a trial found locked even when folding in the saved dogs fails, and reports that', async () => {
    vi.mocked(putEventResults).mockRejectedValueOnce(
      new APIError(new Response(null, { status: 423 }), {
        conflicts: [],
        error: 'resultsLocked',
        saved: [null],
        unchanged: [],
      })
    )
    vi.mocked(previewKennelliittoResults).mockClear()
    expectConsoleOutput(/reportError .*TypeError/)
    const { user } = await renderQualitativePage('fi', {})
    await flushPromises()
    await user.click(within(rowFor('Ensimmainen')).getByLabelText('results.column.result'))
    await user.click(screen.getByRole('option', { name: 'NOU1' }))
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'results.save' }))
    await flushPromises()

    expect(screen.getByText('results.kennelliitto.lockedSave')).toBeInTheDocument()
    expect(previewKennelliittoResults).toHaveBeenCalledWith('test1', [], expect.anything(), undefined)
  })

  describe('a batch refused because a dog is no longer on the trial', () => {
    const pick = async (user: UserEvent, dog: string, option: string) => {
      await user.click(within(rowFor(dog)).getByLabelText('results.column.result'))
      await user.click(screen.getByRole('option', { name: option }))
    }

    it.each([404, 422])(
      'drops the dog that is gone and keeps the others, so they can be saved (%i)',
      async (status) => {
        vi.mocked(putEventResults).mockRejectedValueOnce(
          new APIError(new Response(null, { status, statusText: 'Refused' }), 'did not run')
        )
        expectConsoleOutput(new RegExp(`reportError .*${status}`))
        // The list read again has only the second dog: the first was cancelled while the page was open.
        listRegistrations.mockResolvedValueOnce(
          registrationsToEventWithStations.filter((registration) => registration.id !== 'run-1')
        )
        const { user } = await renderQualitativePage('fi', {})
        await flushPromises()
        await pick(user, 'Ensimmainen', 'NOU1')
        await pick(user, 'Toinen', 'NOU0')
        await flushPromises()

        await user.click(screen.getByRole('button', { name: 'results.save' }))
        await flushPromises()

        expect(screen.getByText('results.saveFailed')).toBeInTheDocument()
        expect(screen.queryByText('Ensimmainen')).not.toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'results.save' })).toBeEnabled()

        await user.click(screen.getByRole('button', { name: 'results.save' }))
        await flushPromises()

        expect(putEventResults).toHaveBeenLastCalledWith(
          'test1',
          [expect.objectContaining({ id: 'run-2' })],
          expect.anything()
        )
      }
    )

    it('keeps every edit when the list cannot be read for want of a token: nothing says a dog is gone', async () => {
      vi.mocked(putEventResults).mockRejectedValueOnce(
        new APIError(new Response(null, { status: 404, statusText: 'Not found' }), 'not found')
      )
      // The refusal and the list that could not be read are both reported.
      expectConsoleOutput(/reportError .*404/, /reportError .*missing token/)
      const { user } = await renderQualitativePage('fi', {}, eventWithStaticDates, {}, '')
      await flushPromises()
      await pick(user, 'Ensimmainen', 'NOU1')
      await pick(user, 'Toinen', 'NOU0')
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'results.save' }))
      await flushPromises()

      expect(screen.getByText('results.saveFailed')).toBeInTheDocument()
      expect(screen.getByText('Ensimmainen')).toBeInTheDocument()
      expect(screen.getByText('Toinen')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'results.save' })).toBeEnabled()
    })
  })

  describe('handing over with the secretary’s word', () => {
    const openNothingSent = async () => {
      vi.mocked(handOverKennelliittoResults).mockClear()
      vi.mocked(handOverKennelliittoResults).mockRejectedValueOnce(
        new APIError(new Response(null, { status: 409 }), { error: 'nothingSent' })
      )
      const { user } = await renderQualitativePage('fi', { 'run-1': stored('NOU1') }, eventWithStaticDates, {
        'run-1': { kcResult: sentOk },
      })
      await flushPromises()
      await user.click(screen.getAllByRole('button', { name: 'results.kennelliitto.handOverButton' })[0])
      await flushPromises()
      return { dialog: within(screen.getByRole('dialog')), user }
    }

    it('asks without the word first, and sends the word only after it has been given', async () => {
      const { dialog, user } = await openNothingSent()

      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' }))
      await flushPromises()
      expect(handOverKennelliittoResults).toHaveBeenCalledTimes(1)
      expect(handOverKennelliittoResults).toHaveBeenLastCalledWith('test1', false, expect.anything())

      await user.click(dialog.getByRole('checkbox'))
      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' }))
      await flushPromises()

      expect(handOverKennelliittoResults).toHaveBeenCalledTimes(2)
      expect(handOverKennelliittoResults).toHaveBeenLastCalledWith('test1', true, expect.anything())
    })

    it('does not carry the word over to the next time the dialog is opened', async () => {
      const { dialog, user } = await openNothingSent()
      await user.click(dialog.getByRole('button', { name: 'results.kennelliitto.handOverButton' }))
      await flushPromises()
      await user.click(dialog.getByRole('checkbox'))

      await user.click(dialog.getByRole('button', { name: 'cancel' }))
      await flushPromises()
      await user.click(screen.getAllByRole('button', { name: 'results.kennelliitto.handOverButton' })[0])
      await flushPromises()
      await user.click(
        within(screen.getByRole('dialog')).getByRole('button', { name: 'results.kennelliitto.handOverButton' })
      )
      await flushPromises()

      expect(handOverKennelliittoResults).toHaveBeenLastCalledWith('test1', false, expect.anything())
    })
  })
})
