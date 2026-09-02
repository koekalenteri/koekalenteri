import type { ConfirmedEvent } from '../../types'
import { TZDate } from '@date-fns/tz'
import { fiFI } from '@mui/material/locale'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { fiFI as gridFiFI } from '@mui/x-data-grid/locales'
import { ConfirmProvider } from 'material-ui-confirm'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { emptyEvent } from '../../__mockData__/emptyEvent'
import theme from '../../assets/Theme'
import { TIME_ZONE } from '../../i18n/dates'
import { TestProvider } from '../../test-utils/AtomProvider'
import { TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import EventListPage from './EventListPage'
import { adminEventsAtom, adminShowPastEventsAtom } from './state'

// The list is filtered by who is looking; an admin sees every event.
vi.mock(import('../../api/user'), async (importOriginal) => ({
  ...(await importOriginal()),
  getUser: async () => ({ admin: true, email: 'admin@example.com', id: 'admin', name: 'Anna Admin' }),
}))

// A screen each, not the page's height: the grid sizes its page to the room it gets.
const PHONE = { height: 844, width: 390 }
const DESKTOP = { height: 800, width: 1200 }

// The grid's own texts in Finnish, as App.tsx sets them; the app's locale bundle drags i18n init along.
const finnishTheme = createTheme(theme, fiFI, gridFiFI)

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
  entries: 12,
  entryEndDate: day('2026-09-27'),
  entryStartDate: day('2026-09-01'),
  eventType,
  id,
  judges: [{ id: 123, name: 'Tuomari 1', official: true }],
  location,
  name,
  official: { email: '', id: 'official', name: 'Teemu Toimitsija', phone: '' },
  places: 30,
  secretary: { email: '', id: 'secretary', name: 'Siiri Sihteeri', phone: '' },
  startDate: day(start),
  state: 'confirmed',
})

const events = [
  trial('syyskoe', 'Syyskoe', 'NOME-B', '2026-10-10', '2026-10-11', 'Hämeenlinna', ['ALO', 'AVO', 'VOI']),
  trial('taipumus', 'Taipumuskoe', 'NOU', '2026-10-17', '2026-10-17', 'Lahti', []),
  trial('vesikoe', 'Vesipelastuskoe', 'VEPE', '2026-10-24', '2026-10-25', 'Tampere', ['ALO', 'AVO']),
  trial('wt', 'Working test', 'NOWT', '2026-11-07', '2026-11-07', 'Espoo', ['ALO', 'AVO', 'VOI']),
]

/** The page as the admin layout shows it: a padded column the height of the screen. */
const renderAt = async ({ height, width }: { height: number; width: number }) => {
  await page.viewport(width, height)

  return render(
    <div
      data-testid="visual-root"
      style={{
        background: '#fff',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        height,
        padding: 8,
        width,
      }}
    >
      <ThemeProvider theme={finnishTheme}>
        <TestProvider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminEventsAtom, events)
            // The fixtures have fixed dates, so the capture must not depend on today's.
            set(adminShowPastEventsAtom, true)
          }}
        >
          <MemoryRouter>
            <ConfirmProvider>
              <Suspense fallback={<div>loading...</div>}>
                <EventListPage />
              </Suspense>
            </ConfirmProvider>
          </MemoryRouter>
        </TestProvider>
      </ThemeProvider>
    </div>
  )
}

it('lists the events on a desktop', async () => {
  const screen = await renderAt(DESKTOP)

  await expect.element(screen.getByText('Syyskoe')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-list-desktop')
})

it('lists the events on a phone', async () => {
  const screen = await renderAt(PHONE)

  await expect.element(screen.getByText('Syyskoe')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('event-list-phone')
})
