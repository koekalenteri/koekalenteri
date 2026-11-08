import { ThemeProvider } from '@mui/material'
import { screen } from '@testing-library/react'
import { Suspense } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { MOCK_NO_ROLE_USER } from '../../api/__mocks__/user'
import { getStartListPreview } from '../../api/registration'
import { getUser } from '../../api/user'
import theme from '../../assets/Theme'
import { flushPromises, renderSuspended, TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import StartListPreviewPage from './StartListPreviewPage'

vi.mock('../../api/event')
vi.mock('../../api/organizer')
vi.mock('../../api/registration')
vi.mock('../../api/user')

describe('StartListPreviewPage', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(() => vi.runOnlyPendingTimers())
  afterAll(() => vi.useRealTimers())

  // A signed-in user without a role was sent to /login, which only sent them back (KOE-1734).
  it('tells a signed-in user without a role that they have no rights', async () => {
    vi.mocked(getUser).mockResolvedValueOnce(MOCK_NO_ROLE_USER)

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <Provider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <Suspense fallback={<div>loading...</div>}>
            <MemoryRouter initialEntries={['/testInvited']}>
              <Routes>
                <Route path=":id" element={<StartListPreviewPage />} />
                <Route path="/login" element={<>Login</>} />
              </Routes>
            </MemoryRouter>
          </Suspense>
        </Provider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(screen.queryByText('Login')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'error.noAdminAccess' })).toBeInTheDocument()
    expect(getStartListPreview).not.toHaveBeenCalled()
  })
})
