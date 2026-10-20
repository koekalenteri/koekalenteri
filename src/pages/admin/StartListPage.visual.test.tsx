import type { DayKey } from '../../types'
import { ThemeProvider } from '@mui/material/styles'
import { Suspense } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { registrationsToEventWithParticipantsInvited } from '../../__mockData__/registrations'
import theme from '../../assets/Theme'
import { TestProvider } from '../../test-utils/AtomProvider'
import { TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import StartListPage from './StartListPage'
import { adminEventRegistrationsAtom, adminEventsAtom } from './state'

// The list needs an admin user to render at all (hasAdminAccessAtom); give it one instead of
// hitting the network, the way EventListPage.visual.test.tsx does for this page family.
vi.mock(import('../../api/user'), async (importOriginal) => ({
  ...(await importOriginal()),
  getUser: async () => ({ admin: true, email: 'admin@example.com', id: 'admin', name: 'Anna Admin' }),
}))

const DESKTOP = { height: 1600, width: 1000 }

const day = (iso: DayKey): DayKey => iso

// The mock data's dates are relative to "today"; a screenshot needs them pinned instead.
const start = day('2026-10-10')
const registrations = registrationsToEventWithParticipantsInvited.map((reg) => ({
  ...reg,
  dates: reg.dates.map((d) => ({ ...d, date: start })),
  group: reg.group?.date ? { ...reg.group, date: start } : reg.group,
}))

it('prints the start list grouped by class and time, with a reserve list', async () => {
  await page.viewport(DESKTOP.width, DESKTOP.height)

  const screen = await render(
    <ThemeProvider theme={theme}>
      <div data-testid="visual-root" style={{ background: '#fff', width: DESKTOP.width }}>
        <TestProvider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminEventsAtom, [{ ...eventWithParticipantsInvited, location: 'Vaasa' }])
            set(adminEventRegistrationsAtom(registrations[0].eventId), registrations)
          }}
        >
          <MemoryRouter initialEntries={[`/${registrations[0].eventId}`]}>
            <Suspense fallback={<div>loading...</div>}>
              <Routes>
                <Route path=":id" element={<StartListPage />} />
              </Routes>
            </Suspense>
          </MemoryRouter>
        </TestProvider>
      </div>
    </ThemeProvider>
  )

  await expect.element(screen.getByText('Dog Name 20').first()).toBeVisible()
  // The days and classes are headings under the page's own title, which only a screen reader reads:
  // on paper the list starts with the first day (KOE-1506).
  await expect.element(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Starttilista: NOME-B Vaasa')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('start-list-desktop')
})
