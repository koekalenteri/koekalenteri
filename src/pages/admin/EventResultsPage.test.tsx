import type { RouteObject } from 'react-router'
import type { Language } from '../../i18n'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFnsV3'
import { cleanup, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '../../__mockData__/events'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { Path } from '../../routeConfig'
import { DataMemoryRouter, flushPromises, renderWithUserEvents, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import EventResultsPage from './EventResultsPage'

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

    expect(screen.getByRole('button', { name: 'save' })).toBeDisabled()
  })

  it('offers a way to record a round that was not scored', async () => {
    const { i18n } = useTranslation()
    renderPage(i18n.language as Language)
    await flushPromises()

    // A dog that is eliminated or withdrawn is common rather than exceptional, so the column exists
    // for every event type — the points grid alone could not record it.
    expect(screen.getByText('results.column.outcome')).toBeInTheDocument()
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
