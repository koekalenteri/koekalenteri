import { ThemeProvider } from '@mui/material'
import { act, fireEvent, screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import theme from '../../assets/Theme'
import { expectConsoleOutput } from '../../test-utils/consoleGuard'
import { flushPromises, renderSuspended, renderSuspendedWithUserEvents, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import JudgeListPage from './JudgeListPage'

vi.mock('../../api/judge')
vi.mock('../../api/user')

describe('JudgeListPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('renders', async () => {
    const { user } = await renderSuspendedWithUserEvents(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <JudgeListPage />
              </SnackbarProvider>
            </Suspense>
          </MemoryRouter>
        </Provider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual(
      expect.arrayContaining(['judgeActive', 'official', 'judgeMockTrial', 'languages'])
    )
    expect(screen.getByText('Tuomari 1')).toBeInTheDocument()

    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeGreaterThan(1)
    user.click(rows[1])
    await flushPromises()

    expect(rows[1]).toHaveClass('Mui-selected')
  })

  // The mock server refuses every judge save, so each change has to end up reported rather than
  // as an unhandled rejection nobody hears about.
  describe('a refused save', () => {
    const renderPage = async () => {
      await renderSuspended(
        <ThemeProvider theme={theme}>
          <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
            <MemoryRouter>
              <Suspense fallback={<div>loading...</div>}>
                <SnackbarProvider>
                  <JudgeListPage />
                </SnackbarProvider>
              </Suspense>
            </MemoryRouter>
          </Provider>
        </ThemeProvider>
      )
      await flushPromises()
    }

    it('is reported for a flag switch', async () => {
      expectConsoleOutput('reportError Error: not implemented')
      await renderPage()

      await act(async () => {
        fireEvent.click(screen.getAllByRole('switch', { name: 'judgeActive' })[0])
      })
      await flushPromises()
    })

    it('is reported for a language toggle', async () => {
      expectConsoleOutput('reportError Error: not implemented')
      await renderPage()

      await act(async () => {
        // The cell labels its toggles with the global i18next t, not the test's keys; the value is stable.
        const swedish = screen.getAllByRole('button').find((button) => button.getAttribute('value') === 'sv')
        if (!swedish) throw new Error('no Swedish toggle')
        fireEvent.click(swedish)
      })
      await flushPromises()
    })
  })
})
