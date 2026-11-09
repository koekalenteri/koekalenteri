import type { TestStore } from 'test-utils/AtomProvider'
import { ThemeProvider } from '@mui/material'
import { act, fireEvent, screen } from '@testing-library/react'
import { Suspense } from 'react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import theme from '../../assets/Theme'
import { Path } from '../../routeConfig'
import {
  DataMemoryRouter,
  flushPromises,
  renderSuspended,
  runPendingTimers,
  TEST_ID_TOKEN,
} from '../../test-utils/utils'
import { idTokenAtom, signingOutAtom, useUserActions } from '../state'
import { AdminAccessGuard } from './AdminAccessGuard'
import AppSnackbarProvider from './AppSnackbarProvider'

vi.mock('../../api/user')
vi.mock('aws-amplify/auth')
vi.mock('./Header', () => ({ default: () => <>header</> }))

function SignOutButton() {
  const { signOut } = useUserActions()
  return (
    <button type="button" onClick={() => void signOut()}>
      SIGN OUT
    </button>
  )
}

const renderAdminPage = (initializeState: (store: TestStore) => void) =>
  renderSuspended(
    <ThemeProvider theme={theme}>
      <Provider initializeState={initializeState}>
        <AppSnackbarProvider>
          <Suspense fallback={<div>loading...</div>}>
            <DataMemoryRouter
              initialEntries={[Path.admin.root]}
              routes={[
                { element: <>HOME PAGE</>, path: Path.home },
                { element: <>LOGIN PAGE</>, path: Path.login },
                {
                  element: (
                    <AdminAccessGuard>
                      <SignOutButton />
                    </AdminAccessGuard>
                  ),
                  path: Path.admin.root,
                },
              ]}
            />
          </Suspense>
        </AppSnackbarProvider>
      </Provider>
    </ThemeProvider>
  )

describe('AdminAccessGuard', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(runPendingTimers)
  afterAll(() => vi.useRealTimers())

  // Sign-out clears the token first; the guard read that as a visitor who is not signed in and
  // sent them to login instead of the front page sign-out heads for (KOE-1734).
  it('lets a user who signs out on an admin page go to the front page, not to login', async () => {
    await renderAdminPage(({ set }) => set(idTokenAtom, TEST_ID_TOKEN))
    await flushPromises()

    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'SIGN OUT' })))
    await flushPromises()

    expect(screen.queryByText('LOGIN PAGE')).not.toBeInTheDocument()
    expect(screen.getByText('HOME PAGE')).toBeInTheDocument()
    expect(screen.getByText('Heippa!')).toBeInTheDocument()
  })

  // The flag a sign-out leaves behind belongs to the page it left: an admin page opened afterwards
  // still sends a visitor who is not signed in to login.
  it('sends a visitor who is not signed in to login after an earlier sign-out', async () => {
    await renderAdminPage(({ set }) => {
      set(idTokenAtom, undefined)
      set(signingOutAtom, true)
    })
    await flushPromises()

    expect(screen.getByText('LOGIN PAGE')).toBeInTheDocument()
  })
})
