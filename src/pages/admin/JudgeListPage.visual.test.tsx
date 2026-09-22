import type { Judge, Language } from '../../types'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import { SnackbarProvider } from 'notistack'
import { Suspense } from 'react'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { muiLocales } from '../../i18n'
import { TestProvider } from '../../test-utils/AtomProvider'
import { describeInLanguage } from '../../test-utils/language'
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

// The grid's own texts in the reader's language, as App.tsx sets them.
const localizedTheme = (language: Language) => createTheme(theme, muiLocales[language])

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

/** The page as the admin layout shows it: a padded column the height of the screen. */
const renderList = async (language: Language = 'fi') => {
  await page.viewport(DESKTOP.width, DESKTOP.height)

  return render(
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
      <ThemeProvider theme={localizedTheme(language)}>
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
}

it('shows who judges a Mock trial on their own, and lets an admin name a NOWT judge (KOE-1357)', async () => {
  const screen = await renderList()

  await expect.element(screen.getByText('Mock trial')).toBeVisible()
  await expect.element(screen.getByText('Maija Mock-tuomari')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('judge-list-mock-trial')
})

// The guide's English page shows the list in English (KOE-1437).
describeInLanguage('en', () => {
  it('shows who judges a Mock trial on their own', async () => {
    const screen = await renderList('en')

    await expect.element(screen.getByText('Maija Mock-tuomari')).toBeVisible()
    await expect.element(screen.getByRole('columnheader', { name: 'Judging languages' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('judge-list-mock-trial-en')
  })
})
