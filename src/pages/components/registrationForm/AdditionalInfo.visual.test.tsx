import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../../assets/Theme'
import { AdditionalInfo } from './AdditionalInfo'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 700 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

it('shows the multiline notes field open with saved text', async () => {
  const screen = await render(
    <Frame>
      <AdditionalInfo notes="Koira on arka, käsittele rauhallisesti." open />
    </Frame>
  )

  await expect
    .element(screen.getByRole('textbox', { name: 'Lisätiedot' }))
    .toHaveValue('Koira on arka, käsittele rauhallisesti.')
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('additional-info-notes')
})
