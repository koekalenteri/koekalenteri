import { ThemeProvider } from '@mui/material'
import { render } from '@testing-library/react'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { RecoilRoot } from 'recoil'
import { mockRegistrations } from '../../api/__mocks__/registration'
import theme from '../../assets/Theme'
import { flushPromises, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../recoil'
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

    const { container } = render(
      <ThemeProvider theme={theme}>
        <RecoilRoot initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <Suspense fallback={<div>loading...</div>}>
            <SnackbarProvider>
              <MemoryRouter initialEntries={['/testInvited']}>
                <Routes>
                  <Route path=":id" element={<StartListPage />} />
                </Routes>
              </MemoryRouter>
            </SnackbarProvider>
          </Suspense>
        </RecoilRoot>
      </ThemeProvider>
    )
    await flushPromises()
    expect(container).toMatchSnapshot()
  })
})
