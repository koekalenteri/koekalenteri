import type { DayKey, Registration, RegistrationClass } from '../../types'
import { ThemeProvider } from '@mui/material'
import { screen } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { mockEvents } from '../../api/__mocks__/event'
import { mockRegistrations } from '../../api/__mocks__/registration'
import theme from '../../assets/Theme'
import { describeWithTranslations } from '../../test-utils/language'
import { flushPromises, renderSuspended, TEST_ID_TOKEN } from '../../test-utils/utils'
import AppSnackbarProvider from '../components/AppSnackbarProvider'
import { idTokenAtom } from '../state'
import StartListPage from './StartListPage'

vi.mock('../../api/event')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')
vi.mock('../../api/user')
// The heading test reads the app's real Finnish; the others read keys.
vi.mock('react-i18next', async (importOriginal) =>
  (await import('../../test-utils/language')).spyOnUseTranslation(importOriginal)
)

const startListRegistrations = mockRegistrations.testInvited

describe('OrganizerListPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => {
    vi.runOnlyPendingTimers()
    mockRegistrations.testInvited = startListRegistrations
  })
  afterAll(() => vi.useRealTimers())

  it('renders', async () => {
    mockRegistrations.testInvited = [...startListRegistrations].reverse()

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <Suspense fallback={<div>loading...</div>}>
            <AppSnackbarProvider>
              <MemoryRouter initialEntries={['/testInvited']}>
                <Routes>
                  <Route path=":id" element={<StartListPage />} />
                </Routes>
              </MemoryRouter>
            </AppSnackbarProvider>
          </Suspense>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(screen.getAllByText(/^ALO/)[0]).toBeInTheDocument()
    expect(screen.getAllByText(/^AVO/)[0]).toBeInTheDocument()
    expect(screen.getAllByRole('row').length).toBeGreaterThan(1)
  })

  describeWithTranslations('fi', () => {
    // The days are day keys (KOE-1547): grouped, ordered and headed by them, the reserve last.
    it('heads each day with its weekday in calendar order, then the reserve', async () => {
      const base = startListRegistrations[0]
      const placed = (id: string, regNo: string, date: DayKey): Registration => ({
        ...base,
        class: 'ALO',
        dog: { ...base.dog, regNo },
        group: { date, key: `${date}-ap`, number: 1, time: 'ap' },
        id,
        startGroup: undefined,
      })
      mockRegistrations.testInvited = [
        placed('r-thu', 'THU-1', '2021-02-11'),
        { ...placed('r-res', 'RES-1', '2021-02-10'), group: { key: 'reserve', number: 1 } },
        placed('r-wed', 'WED-1', '2021-02-10'),
      ]

      await renderSuspended(
        <ThemeProvider theme={theme}>
          <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <MemoryRouter initialEntries={['/testInvited']}>
                  <Routes>
                    <Route path=":id" element={<StartListPage />} />
                  </Routes>
                </MemoryRouter>
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </ThemeProvider>
      )
      await flushPromises()

      expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
        'ke 10.2.',
        'to 11.2.',
        'Varalla',
      ])
    })
  })

  it("prints a WT trial's reserves as one list in reserve-number order", async () => {
    // One reserve list for the whole trial (KOE-912): no class heading splitting it up, the class
    // on each row instead, and the order is the shared reserve number.
    const base = startListRegistrations[0]
    const reserve = (id: string, eventClass: RegistrationClass, regNo: string, number: number): Registration => ({
      ...base,
      class: eventClass,
      dog: { ...base.dog, regNo },
      eventType: 'NOWT',
      group: { key: 'reserve', number },
      id,
      startGroup: undefined,
    })
    mockRegistrations.testInvited = [reserve('r-alo', 'ALO', 'ALO-1', 2), reserve('r-voi', 'VOI', 'VOI-1', 1)]
    // The trial's own type decides the shared list (KOE-1718), so the event is a WT trial too.
    const invited = mockEvents.find((item) => item.id === 'testInvited')
    if (!invited) throw new Error('no testInvited event')
    const { eventType } = invited
    invited.eventType = 'NOWT'
    onTestFinished(() => {
      invited.eventType = eventType
    })

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <Suspense fallback={<div>loading...</div>}>
            <AppSnackbarProvider>
              <MemoryRouter initialEntries={['/testInvited']}>
                <Routes>
                  <Route path=":id" element={<StartListPage />} />
                </Routes>
              </MemoryRouter>
            </AppSnackbarProvider>
          </Suspense>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    // Translations are not loaded in this suite, so the keys stand in for the Finnish labels.
    expect(screen.getAllByText('startListExport.class')).toHaveLength(1)
    expect(screen.queryByRole('heading', { name: /^ALO/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /^VOI/ })).not.toBeInTheDocument()

    const rows = screen.getAllByRole('row')
    const reserveRows = rows.filter((row) => row.textContent?.includes('-1'))
    expect(reserveRows.map((row) => row.querySelectorAll('td')[1]?.textContent)).toEqual(['VOI', 'ALO'])
  })
})
