import type { RouteObject } from 'react-router'
import type { ClassStartNumbers, DayKey } from '../types'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../assets/Theme'
import { Path } from '../routeConfig'
import { TestProvider } from '../test-utils/AtomProvider'
import { freezeClockAt } from '../test-utils/freezeClock'
import { DataMemoryRouter } from '../test-utils/utils'
import { Component as ClassStartNumbersPage } from './ClassStartNumbersPage'
import AppSnackbarProvider from './components/AppSnackbarProvider'

// The draw is done the week before the trial; a day of its own keeps the sheet from moving (KOE-1423).
freezeClockAt('2026-09-07')

const DAY: DayKey = '2026-09-12'

const sheet: ClassStartNumbers = {
  event: {
    classes: [{ class: 'ALO', date: DAY }],
    endDate: DAY,
    eventType: 'NOWT',
    id: 'event-1',
    location: 'Ranua',
    name: 'Syyskoe',
    startDate: DAY,
  },
  eventClass: 'ALO',
  registrations: [
    {
      class: 'ALO',
      dog: { name: 'Ensimmainen', regNo: 'FI10000/26' },
      eventType: 'NOWT',
      group: { date: DAY, key: 'ALO-AP', number: 1, time: 'ap' },
      handler: { name: 'Ohjaaja 1' },
      id: 'alo-1',
    },
    {
      class: 'ALO',
      dog: { name: 'Toinen', regNo: 'FI20000/26' },
      eventType: 'NOWT',
      group: { date: DAY, key: 'ALO-AP', number: 2, time: 'ap' },
      handler: { name: 'Ohjaaja 2' },
      id: 'alo-2',
    },
  ],
  reserved: [],
}

// The class secretary's link reads the sheet with its token; this is what the link hands back.
vi.mock(import('../api/startNumbers'), async (importOriginal) => ({
  ...(await importOriginal()),
  getClassStartNumbers: async () => sheet,
}))

it("opens one class's draw sheet under the page's own heading", async () => {
  const routes: RouteObject[] = [
    { element: <ClassStartNumbersPage />, path: 'start-numbers/:eventId/:eventClass/access/:token' },
  ]
  await page.viewport(900, 500)

  const screen = await render(
    <div data-testid="visual-root" style={{ background: '#fff', display: 'flex', height: 500, width: 900 }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <TestProvider>
          <AppSnackbarProvider>
            <DataMemoryRouter
              initialEntries={[Path.classStartNumbers('event-1', 'ALO', 'link-token')]}
              routes={routes}
            />
          </AppSnackbarProvider>
        </TestProvider>
      </ThemeProvider>
    </div>
  )

  // The sheet is the whole page for a class secretary, so its title is the page's heading (KOE-1506).
  await expect.element(screen.getByText('Toinen')).toBeVisible()
  await expect.element(screen.getByRole('heading', { level: 1 })).toBeVisible()
  expect(screen.getByRole('heading').elements()).toHaveLength(1)
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('class-start-numbers-page')
})
