import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../assets/Theme'
import { InternalNotesInfo } from './InternalNotesInfo'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 700 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

it('shows the secretary-only note with its autosave status', async () => {
  // These notes never reach the registrant and save through their own endpoint (see the
  // component doc comment), which is why the field carries its own save-status helper text.
  const screen = await render(
    <Frame>
      <InternalNotesInfo notes="Ei vastaa puhelimeen, käytä sähköpostia." open />
    </Frame>
  )

  await expect
    .element(screen.getByLabelText('Sisäinen kommentti (ei näy ilmoittautujalle)', { exact: false }))
    .toBeVisible()
  await expect.element(screen.getByText('Tallentuu automaattisesti')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('internal-notes-info-autosave')
})
