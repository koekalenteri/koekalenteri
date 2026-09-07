import { ThemeProvider } from '@mui/material'
import { screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import theme from '../../assets/Theme'
import { flushPromises, renderSuspendedWithUserEvents, TEST_ID_TOKEN } from '../../test-utils/utils'
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
})
