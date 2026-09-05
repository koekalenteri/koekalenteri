import type { Judge } from '../../types'
import { fiFI } from '@mui/material/locale'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { fiFI as gridFiFI } from '@mui/x-data-grid/locales'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { TestProvider } from '../../test-utils/AtomProvider'
import { TEST_ID_TOKEN } from '../../test-utils/utils'
import { idTokenAtom } from '../state'
import JudgeListPage from './JudgeListPage'
import { adminJudgesAtom } from './state'

// The flags are an admin's to flip; anyone else sees the switches disabled.
vi.mock(import('../../api/user'), async (importOriginal) => ({
  ...(await importOriginal()),
  getUser: async () => ({ admin: true, email: 'admin@example.com', id: 'admin', name: 'Anna Admin' }),
}))

const DESKTOP = { height: 500, width: 1400 }

// The grid's own texts in Finnish, as App.tsx sets them.
const finnishTheme = createTheme(theme, fiFI, gridFiFI)

const judge = (id: number, name: string, location: string, eventTypes: string[], mockTrial?: boolean): Judge => ({
  active: true,
  district: 'Uudenmaan Kennelpiiri ry',
  email: `${id}@example.com`,
  eventTypes,
  id,
  languages: ['fi'],
  location,
  mockTrial,
  name,
  official: true,
  phone: '040 1234567',
})

const judges = [
  judge(1, 'Aino A-tuomari', 'Helsinki', ['NOME-A', 'NOME-B']),
  judge(2, 'Nea Nowt-tuomari', 'Espoo', ['NOWT']),
  judge(3, 'Maija Mock-tuomari', 'Vantaa', ['NOWT'], true),
  judge(4, 'Bertta B-tuomari', 'Lahti', ['NOME-B']),
]

it('shows who judges a Mock trial on their own, and lets an admin name a NOWT judge (KOE-1357)', async () => {
  await page.viewport(DESKTOP.width, DESKTOP.height)

  const screen = await render(
    <div
      data-testid="visual-root"
      style={{
        background: '#fff',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        height: DESKTOP.height,
        padding: 8,
        width: DESKTOP.width,
      }}
    >
      <ThemeProvider theme={finnishTheme}>
        <TestProvider
          initializeState={({ set }) => {
            set(idTokenAtom, TEST_ID_TOKEN)
            set(adminJudgesAtom, judges)
          }}
        >
          <MemoryRouter>
            <SnackbarProvider>
              <Suspense fallback={<div>loading...</div>}>
                <JudgeListPage />
              </Suspense>
            </SnackbarProvider>
          </MemoryRouter>
        </TestProvider>
      </ThemeProvider>
    </div>
  )

  await expect.element(screen.getByText('Mock trial -tuomari')).toBeVisible()
  await expect.element(screen.getByText('Maija Mock-tuomari')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('judge-list-mock-trial')
})
