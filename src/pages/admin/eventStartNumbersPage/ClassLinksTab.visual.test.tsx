import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { ClassLinksTab } from './ClassLinksTab'

const DESKTOP = { height: 240, width: 1200 }
const PHONE = { height: 360, width: 390 }

const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: '100%' }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const sheet = <ClassLinksTab classes={['ALO', 'AVO', 'VOI']} onCopy={() => undefined} onRevoke={() => undefined} />

// Every class of the trial on one sheet, with the sentence saying what the link is for read once,
// above them all (KOE-1433).
it('lists every class with its link controls, under one sentence saying what the link is for', async () => {
  await page.viewport(DESKTOP.width, DESKTOP.height)

  const screen = await render(<Frame>{sheet}</Frame>)

  await expect.element(screen.getByRole('button', { name: 'Kopioi linkki' }).first()).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('class-links-tab')
})

/** A phone's width: the two buttons of a row stack, and the class stays beside them. */
it('keeps a class and its buttons on one row when the width runs out', async () => {
  await page.viewport(PHONE.width, PHONE.height)

  const screen = await render(<Frame>{sheet}</Frame>)

  await expect.element(screen.getByRole('button', { name: 'Mitätöi linkit' }).first()).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('class-links-tab-narrow')
})
