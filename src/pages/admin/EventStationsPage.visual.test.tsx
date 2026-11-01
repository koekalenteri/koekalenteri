import type { Language } from '../../i18n'
import type { ConfirmedEvent } from '../../types'
import { ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { Suspense } from 'react'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStations, RESULTS_EVENT_DAY } from '../../__mockData__/resultsEvent'
import theme from '../../assets/Theme'
import { locales } from '../../i18n'
import { addDays } from '../../lib/day'
import { Path } from '../../routeConfig'
import { TestProvider } from '../../test-utils/AtomProvider'
import { freezeClockAt } from '../../test-utils/freezeClock'
import { describeInLanguage } from '../../test-utils/language'
import { DataMemoryRouter } from '../../test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import EventStationsPage from './EventStationsPage'
import { adminEventsAtom } from './state'

// The trial is long past; a day of its own keeps what the page says about it from moving (KOE-1423).
freezeClockAt('2026-09-07')

const SECOND_DAY = addDays(RESULTS_EVENT_DAY, 1)

// A course is built per day, and over two days each day's posts sit under the day as a heading of
// their own, one level below the page's title (KOE-1506).
const event: ConfirmedEvent = {
  ...eventWithStations,
  classes: [
    { class: 'ALO', date: RESULTS_EVENT_DAY },
    { class: 'AVO', date: SECOND_DAY },
  ],
  endDate: SECOND_DAY,
  stations: [
    ...eventWithStations.stations,
    { date: SECOND_DAY, id: 'post-3', judges: [{ id: 223, name: 'Tuomari 2' }], number: 1, tasks: 2 },
  ],
}

it("lays out the course under each of the trial's days", async () => {
  await page.viewport(1000, 900)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 1000 }}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <TestProvider initializeState={({ set }) => set(adminEventsAtom, [event])}>
            <AppSnackbarProvider>
              <Suspense fallback={<div>loading...</div>}>
                <DataMemoryRouter
                  initialEntries={[Path.admin.stations(event.id)]}
                  routes={[{ element: <EventStationsPage />, path: Path.admin.stations() }]}
                />
              </Suspense>
            </AppSnackbarProvider>
          </TestProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByRole('heading', { level: 1 })).toBeVisible()
  await expect.element(screen.getByRole('heading', { level: 2 }).nth(1)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-stations-page-two-days')
})

// The organiser's map of KOE-1665: three judges at three posts, each class starting at a different
// post and doing two tasks at its last.
const judge = (id: number, name: string) => ({ id, name })
const rotationEvent: ConfirmedEvent = {
  ...eventWithStations,
  classes: [
    { class: 'ALO', date: RESULTS_EVENT_DAY },
    { class: 'AVO', date: RESULTS_EVENT_DAY },
    { class: 'VOI', date: RESULTS_EVENT_DAY },
  ],
  judges: [judge(1, 'Tuomari A'), judge(2, 'Tuomari B'), judge(3, 'Tuomari C')],
  rotations: [
    { class: 'ALO', posts: [{ stationId: 'r1' }, { stationId: 'r2' }, { stationId: 'r3', taskCount: 2 }] },
    { class: 'AVO', posts: [{ stationId: 'r3' }, { stationId: 'r1' }, { stationId: 'r2', taskCount: 2 }] },
    { class: 'VOI', posts: [{ stationId: 'r2' }, { stationId: 'r3' }, { stationId: 'r1', taskCount: 2 }] },
  ],
  stations: [1, 2, 3].map((number) => ({
    date: RESULTS_EVENT_DAY,
    id: `r${number}`,
    judges: [judge(number, `Tuomari ${'ABC'[number - 1]}`)],
    number,
    parts: 1,
  })),
}

const renderRotation = (language: Language) =>
  render(
    <div data-testid="visual-root" style={{ background: '#fff', width: 1280 }}>
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales[language]}>
          <TestProvider initializeState={({ set }) => set(adminEventsAtom, [rotationEvent])}>
            <AppSnackbarProvider>
              <Suspense fallback={<div>loading...</div>}>
                <DataMemoryRouter
                  initialEntries={[Path.admin.stations(rotationEvent.id)]}
                  routes={[{ element: <EventStationsPage />, path: Path.admin.stations() }]}
                />
              </Suspense>
            </AppSnackbarProvider>
          </TestProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </div>
  )

it("lays out a day's rotation the way the organiser's map does (KOE-1665)", async () => {
  await page.viewport(1280, 900)
  const screen = await renderRotation('fi')

  await expect.element(screen.getByText('Rasti 1: ALO, AVO, VOI (x 2)')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-stations-rotation')
})

describeInLanguage('en', () => {
  it("lays out a day's rotation the way the organiser's map does (KOE-1665)", async () => {
    await page.viewport(1280, 900)
    const screen = await renderRotation('en')

    await expect.element(screen.getByText('Station 1: ALO, AVO, VOI (x 2)')).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-stations-rotation-en')
  })
})
