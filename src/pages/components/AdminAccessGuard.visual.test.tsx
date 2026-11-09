import { ThemeProvider } from '@mui/material/styles'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { getUser } from '../../api/user'
import theme from '../../assets/Theme'
// The "Etusivulle" link's look is a global class (see ErrorPage.visual.test.tsx).
import '../../index.css'
import { TestProvider } from '../../test-utils/AtomProvider'
import { expectConsoleOutput } from '../../test-utils/consoleGuard'
import { TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import { AdminAccessGuard } from './AdminAccessGuard'

vi.mock(import('../../api/user'), async (importOriginal) => ({
  ...(await importOriginal()),
  getUser: vi.fn(),
}))

const VIEWPORT = { height: 400, width: 800 }

const renderGuard = async () => {
  await page.viewport(VIEWPORT.width, VIEWPORT.height)
  return render(
    <ThemeProvider theme={theme}>
      <div
        data-testid="visual-root"
        style={{ background: '#fff', display: 'flow-root', height: VIEWPORT.height, width: VIEWPORT.width }}
      >
        <TestProvider initializeState={({ set }) => set(idTokenAtom, TEST_ID_TOKEN)}>
          <MemoryRouter initialEntries={['/admin']}>
            <Suspense fallback={<div>loading...</div>}>
              <AdminAccessGuard>ADMIN PAGE</AdminAccessGuard>
            </Suspense>
          </MemoryRouter>
        </TestProvider>
      </div>
    </ThemeProvider>
  )
}

it('tells a signed-in user without a role that they have no rights', async () => {
  vi.mocked(getUser).mockResolvedValue({ email: 'norole@example.com', id: 'norole', name: 'Nora Role', roles: {} })

  const screen = await renderGuard()

  await expect.element(screen.getByRole('heading', { name: 'Ei käyttöoikeutta' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('admin-access-denied')
})

it('offers a retry when the signed-in user could not be loaded', async () => {
  // The failed load is the fixture: the user lookup reports it before the page shows.
  expectConsoleOutput(/auth: \/user request failed/, /reportError/)
  vi.mocked(getUser).mockRejectedValue(new Error('network down'))

  const screen = await renderGuard()

  await expect.element(screen.getByRole('heading', { name: 'Käyttäjätietojasi ei saatu ladattua.' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('admin-access-unavailable')
})
