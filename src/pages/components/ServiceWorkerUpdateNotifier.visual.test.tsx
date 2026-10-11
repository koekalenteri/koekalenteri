import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { SnackbarProvider } from 'notistack'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { updatedSessionKey } from '../../serviceWorkerRegistration'
import { switchLanguage } from '../../test-utils/language'
import ServiceWorkerUpdateNotifier from './ServiceWorkerUpdateNotifier'

// The snackbar is position: fixed; the frame's transform makes it the containing block, so the
// notice lands inside the fixed-width, opaque frame the screenshot is taken of.
const Frame = ({ children }: { readonly children: React.ReactNode }) => (
  <div data-testid="visual-root" style={{ background: '#fff', height: 96, transform: 'translateZ(0)', width: 520 }}>
    {children}
  </div>
)

// CssBaseline gives the body the theme's font, as index.tsx does; the snackbar's message inherits it.
const renderNotifier = () =>
  render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Frame>
        <SnackbarProvider anchorOrigin={{ horizontal: 'right', vertical: 'top' }} autoHideDuration={null}>
          <ServiceWorkerUpdateNotifier />
        </SnackbarProvider>
      </Frame>
    </ThemeProvider>
  )

describe('ServiceWorkerUpdateNotifier', () => {
  afterEach(async () => {
    window.sessionStorage.clear()
    await switchLanguage('fi')
  })

  // The notice can be enqueued before the language it should be read in is in place (App realigns
  // i18next in an effect that runs after the notifier's), and it stays on screen while the reader may
  // switch, so it is translated when it renders, not when it is enqueued (KOE-1457).
  it('follows a language switch made after the notice was enqueued', async () => {
    window.sessionStorage.setItem(updatedSessionKey, JSON.stringify({ from: '1.10.2', to: '1.10.3' }))

    const screen = await renderNotifier()
    await expect.element(screen.getByText('Sovellus päivitetty: 1.10.2 → 1.10.3')).toBeVisible()

    await switchLanguage('en')

    await expect.element(screen.getByText('App updated: 1.10.2 → 1.10.3')).toBeVisible()
    await expect.element(screen.getByRole('link', { name: "See what's new" })).toBeVisible()
    await expect.element(screen.getByRole('button', { name: 'Close' })).toBeVisible()

    // The snackbar grows in over 225ms; the capture must wait out that transition.
    await new Promise((resolve) => setTimeout(resolve, 400))

    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('update-notice-en')
  })

  // At boot i18next is already in the reader's language (src/i18n/index.ts, tested there); this is
  // the build time notice rendered in English from its first frame, with no switch after it.
  it('shows the build time notice in the language i18next has when the notifier mounts', async () => {
    await switchLanguage('en')
    window.sessionStorage.setItem(updatedSessionKey, JSON.stringify({ from: '1.10.3', to: '1.10.3' }))

    const screen = await renderNotifier()
    const notice = screen.getByRole('alert')
    await expect.element(notice).toBeVisible()

    // The build time follows the runner's timezone, so only the shape around it is asserted.
    expect(notice.element()).toHaveTextContent(/^App updated: 1\.10\.3 \(\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}\)$/)
  })

  it('follows a language switch made after the build time notice was enqueued', async () => {
    window.sessionStorage.setItem(updatedSessionKey, JSON.stringify({ from: '1.10.3', to: '1.10.3' }))

    const screen = await renderNotifier()
    const notice = screen.getByRole('alert')
    await expect.element(notice).toHaveTextContent(/^Sovellus päivitetty: /)

    await switchLanguage('en')

    await expect.element(notice).toHaveTextContent(/^App updated: /)
    expect(notice.element()).toHaveTextContent(/^App updated: 1\.10\.3 \(\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}\)$/)
  })
})
