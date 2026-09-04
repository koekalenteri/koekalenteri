import type { Registration, RegistrationClass } from '../../types'
import { ThemeProvider } from '@mui/material'
import { screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { mockRegistrations } from '../../api/__mocks__/registration'
import theme from '../../assets/Theme'
import { flushPromises, renderSuspended, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import StartListPage from './StartListPage'

vi.mock('../../api/event')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')
vi.mock('../../api/user')

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

    const { container } = await renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <MemoryRouter initialEntries={['/testInvited']}>
                <Routes>
                  <Route path=":id" element={<StartListPage />} />
                </Routes>
              </MemoryRouter>
            </SnackbarProvider>
          </Suspense>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
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

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <MemoryRouter initialEntries={['/testInvited']}>
                <Routes>
                  <Route path=":id" element={<StartListPage />} />
                </Routes>
              </MemoryRouter>
            </SnackbarProvider>
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
