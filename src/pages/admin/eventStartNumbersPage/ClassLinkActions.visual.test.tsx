import { ThemeProvider } from '@mui/material/styles'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { ClassLinkActions } from './ClassLinkActions'

const DESKTOP = { height: 120, width: 1200 }
const PHONE = { height: 160, width: 390 }

const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', paddingBlock: 8, width: '100%' }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

const actions = <ClassLinkActions onCopy={() => undefined} onRevoke={() => undefined} />

// What the secretary reads before handing a class link to a volunteer (KOE-1267): the sentence
// belongs beside the buttons, not behind a hover.
it('says what the class link is for, on the buttons own row where there is room', async () => {
  await page.viewport(DESKTOP.width, DESKTOP.height)

  const screen = await render(<Frame>{actions}</Frame>)

  await expect.element(screen.getByRole('button', { name: 'Kopioi luokkasihteerin linkki' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('class-link-actions')
})

/** Narrower than the sentence: it takes its own line and the buttons keep theirs. */
it('wraps the sentence above the buttons when the row runs out of width', async () => {
  await page.viewport(PHONE.width, PHONE.height)

  const screen = await render(<Frame>{actions}</Frame>)

  await expect.element(screen.getByRole('button', { name: 'Mitätöi luokan linkit' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('class-link-actions-narrow')
})
