import type { ConfirmedEvent } from '../types'
import { TZDate } from '@date-fns/tz'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { emptyEvent } from '../__mockData__/emptyEvent'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { TIME_ZONE } from '../i18n/dates'
// The register link's black/bold/underlined look is a global class, not a theme override; without
// it the link falls back to the browser's default blue (KOE-1324, caught against a real device).
import '../index.css'
import { TestProvider } from '../test-utils/AtomProvider'
import { SearchPage } from './SearchPage'
import { eventFilterAtom } from './state'

// DateHandler (mounted by SearchPage) always fetches on mount; give it fixed data instead of
// hitting the network, and let each test pick what that fetch returns.
let mockedEvents: ConfirmedEvent[] = []
vi.mock(import('../api/event'), async (importOriginal) => ({
  ...(await importOriginal()),
  getEvents: async () => ({ events: mockedEvents, unchangedIds: [] }),
}))

const PHONE = { height: 1000, width: 390 }
const DESKTOP = { height: 1000, width: 1200 }

// The filter accordion slides open; a capture mid-slide is not a layout anyone gets.
const stillTheme = createTheme(theme, { transitions: { getAutoHeightDuration: () => 0 } })

const day = (iso: string) => new TZDate(iso, TIME_ZONE)

const trial = (
  id: string,
  name: string,
  eventType: string,
  start: string,
  end: string,
  location: string,
  classes: string[]
): ConfirmedEvent => ({
  ...emptyEvent,
  classes: classes.map((c) => ({ class: c, date: day(start) })),
  endDate: day(end),
  entries: 4,
  entryEndDate: day('2026-09-27'),
  entryStartDate: day('2026-09-01'),
  eventType,
  id,
  judges: [{ id: 123, name: 'Tuomari 1', official: true }],
  location,
  name,
  places: 10,
  startDate: day(start),
  state: 'confirmed',
})

const events = [
  trial('syyskoe', 'Syyskoe', 'NOME-B', '2026-10-10', '2026-10-11', 'Hämeenlinna', ['ALO', 'AVO']),
  trial('talvikoe', 'Talvikoe', 'NOU', '2026-11-14', '2026-11-14', 'Lahti', []),
]

// The default filter's start is "today" on the real clock; pin it so the list doesn't drift.
const fixedFilter = {
  end: null,
  eventClass: [],
  eventType: [],
  judge: [],
  organizer: [],
  start: day('2026-09-01'),
  withClosingEntry: false,
  withFreePlaces: false,
  withOpenEntry: false,
  withResults: false,
  withUpcomingEntry: false,
}

const renderAt = async ({ height, width }: { height: number; width: number }, initialEvents: ConfirmedEvent[]) => {
  // eventsAtom/eventMetadataAtom persist to the real browser's localStorage, which otherwise
  // leaks a previous test's fetch result (and its throttling metadata) into the next one.
  localStorage.clear()
  mockedEvents = initialEvents
  await page.viewport(width, height)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', width }}>
      <ThemeProvider theme={stillTheme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <TestProvider initializeState={({ set }) => set(eventFilterAtom, fixedFilter)}>
            <SnackbarProvider>
              <MemoryRouter>
                <Suspense fallback={<div>loading...</div>}>
                  <SearchPage />
                </Suspense>
              </MemoryRouter>
            </SnackbarProvider>
          </TestProvider>
        </LocalizationProvider>
      </ThemeProvider>
    </div>
  )

  // The filter's `position: sticky` is meaningless without the real app's scrollable layout and
  // fixed header to stick within, and in this isolated render it makes Chromium misjudge the
  // sticky element as already "stuck" -- clipping a stripe out of the first list row underneath it.
  const nav = document.querySelector('nav')
  if (nav) nav.style.position = 'static'

  return screen
}

it('shows the full event list on a desktop', async () => {
  const screen = await renderAt(DESKTOP, events)

  await expect.element(screen.getByText('Syyskoe')).toBeVisible()
  await expect.element(screen.getByText('Talvikoe')).toBeVisible()
  await expect.element(screen.getByText('Suomen Noutajakoirajärjestö ry').first()).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('search-page-full-desktop')
})

it('shows the full event list on a phone', async () => {
  const screen = await renderAt(PHONE, events)

  await expect.element(screen.getByText('Syyskoe')).toBeVisible()
  await expect.element(screen.getByText('Talvikoe')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('search-page-full-phone')
})

it('shows the empty result on a desktop', async () => {
  const screen = await renderAt(DESKTOP, [])

  await expect.element(screen.getByText(/ei löytynyt tapahtumia/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('search-page-empty-desktop')
})

it('shows the empty result on a phone', async () => {
  const screen = await renderAt(PHONE, [])

  await expect.element(screen.getByText(/ei löytynyt tapahtumia/)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('search-page-empty-phone')
})
