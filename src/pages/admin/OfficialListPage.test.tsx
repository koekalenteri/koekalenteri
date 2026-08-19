import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { RecoilRoot } from 'recoil'
import theme from '../../assets/Theme'
import { flushPromises, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../recoil'
import OfficialListPage from './OfficialListPage'

vi.mock('../../api/official')
vi.mock('../../api/user')

describe('OfficialListPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  it('renders', async () => {
    const { container } = render(
      <ThemeProvider theme={theme}>
        <RecoilRoot initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter>
            <Suspense fallback={<div>loading...</div>}>
              <SnackbarProvider>
                <OfficialListPage />
              </SnackbarProvider>
            </Suspense>
          </MemoryRouter>
        </RecoilRoot>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })
})
