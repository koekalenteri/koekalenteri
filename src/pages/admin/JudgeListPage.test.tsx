import { ThemeProvider } from '@mui/material'
import { screen } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { RecoilRoot } from 'recoil'
import theme from '../../assets/Theme'
import { flushPromises, renderWithUserEvents, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../recoil'
import JudgeListPage from './JudgeListPage'

vi.mock('../../api/judge')
vi.mock('../../api/user')

describe('JudgeListPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('renders', async () => {
    const { container, user } = renderWithUserEvents(
      <ThemeProvider theme={theme}>
        <RecoilRoot initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <JudgeListPage />
              </SnackbarProvider>
            </Suspense>
          </MemoryRouter>
        </RecoilRoot>
      </ThemeProvider>,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )
    await flushPromises()
    expect(container).toMatchSnapshot()

    user.click(screen.getAllByRole('row')[2])
    await flushPromises()

    expect(screen.getAllByRole('row')).toMatchSnapshot()
  })
})
