import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '@/assets/Theme'
import { TemplateErrorAlert } from './TemplateErrorAlert'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width: 800 }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

// The notice under the editor when a save is refused (KOE-1434): a block closed with the wrong tag,
// which Handlebars places to the column, and a rejection SES gave no line for.
it('names the language, line and column of a syntax error', async () => {
  const screen = await render(
    <Frame>
      <TemplateErrorAlert error={{ column: 4, language: 'fi', line: 12, message: "if doesn't match each" }} />
    </Frame>
  )

  await expect.element(screen.getByRole('alert')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('template-error-alert-syntax')
})

it('names the language and the reason when there is no line', async () => {
  const screen = await render(
    <Frame>
      <TemplateErrorAlert error={{ language: 'en', message: '#if requires exactly one argument' }} />
    </Frame>
  )

  await expect.element(screen.getByRole('alert')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('template-error-alert-rejected')
})
