import type { VariantType } from 'notistack'
import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { useSnackbar } from 'notistack'
import { useEffect } from 'react'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import AppSnackbarProvider from './AppSnackbarProvider'

const notices: ReadonlyArray<readonly [VariantType, string]> = [
  ['success', 'Tallennettu'],
  ['info', 'Ilmoittautuminen on lähetetty'],
  ['warning', 'Koe on jo alkanut'],
  ['error', 'Tallennus epäonnistui'],
]

const Notices = () => {
  const { enqueueSnackbar } = useSnackbar()

  useEffect(() => {
    for (const [variant, message] of notices) enqueueSnackbar(message, { variant })
  }, [enqueueSnackbar])

  return null
}

// The snackbars are position: fixed; the frame's transform makes it their containing block, so they
// land inside the fixed-width, opaque frame the screenshot is taken of.
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', height: 264, transform: 'translateZ(0)', width: 420 }}>
    {children}
  </div>
)

// The variants paint the theme's semantic colours, so white text on each clears 4.5:1; the audit
// that runs with the screenshot checks every one of them (KOE-1507).
it('shows each notice variant in a colour its text can be read on', async () => {
  const screen = await render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Frame>
        <AppSnackbarProvider autoHideDuration={null} maxSnack={notices.length}>
          <Notices />
        </AppSnackbarProvider>
      </Frame>
    </ThemeProvider>
  )

  for (const [, message] of notices) await expect.element(screen.getByText(message)).toBeVisible()

  // The snackbars grow in over 225ms; the capture must wait out that transition.
  await new Promise((resolve) => setTimeout(resolve, 400))

  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('snackbar-variants')
})
