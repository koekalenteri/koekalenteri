import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import { SnackbarProvider } from 'notistack'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { updatedSessionKey } from '../../serviceWorkerRegistration'
import { switchLanguage } from '../../test-utils/language'
import ServiceWorkerUpdateNotifier from './ServiceWorkerUpdateNotifier'

// CssBaseline gives the body the theme's font, as index.tsx does; the snackbar's message inherits it.
const renderNotifier = () =>
  render(
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <SnackbarProvider autoHideDuration={null}>
        <ServiceWorkerUpdateNotifier />
      </SnackbarProvider>
    </ThemeProvider>
  )

// The client boots i18next in the reader's stored language (src/i18n/index.ts); here it is set the
// way the language menu sets it, before the notifier mounts (KOE-1457).
describe('ServiceWorkerUpdateNotifier', () => {
  afterEach(async () => {
    window.sessionStorage.clear()
    await switchLanguage('fi')
  })

  it('shows the version change in the stored language', async () => {
    await switchLanguage('en')
    window.sessionStorage.setItem(updatedSessionKey, JSON.stringify({ from: '1.10.2', to: '1.10.3' }))

    const screen = await renderNotifier()

    await expect.element(screen.getByText('App updated: 1.10.2 → 1.10.3')).toBeVisible()
    await expect.element(screen.getByRole('link', { name: "See what's new" })).toBeVisible()

    // The snackbar grows in over 225ms; the capture must wait out that transition.
    await new Promise((resolve) => setTimeout(resolve, 400))

    await expect(screen.getByRole('alert')).toMatchScreenshot('update-notice-en')
  })

  it('shows the build time notice in the stored language', async () => {
    await switchLanguage('en')
    window.sessionStorage.setItem(updatedSessionKey, JSON.stringify({ from: '1.10.3', to: '1.10.3' }))

    const screen = await renderNotifier()
    const notice = screen.getByRole('alert')
    await expect.element(notice).toBeVisible()

    // The build time follows the runner's timezone, so only the shape around it is asserted.
    expect(notice.element()).toHaveTextContent(/^App updated: 1\.10\.3 \(\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}\)$/)
  })

  // The notice stays on screen while the reader may switch the language, so it is translated when it
  // renders, not when it is enqueued.
  it('follows a language switch made after the notice was shown', async () => {
    await switchLanguage('en')
    window.sessionStorage.setItem(updatedSessionKey, JSON.stringify({ from: '1.10.3', to: '1.10.3' }))

    const screen = await renderNotifier()
    const notice = screen.getByRole('alert')
    await expect.element(notice).toHaveTextContent(/^App updated: /)

    await switchLanguage('fi')

    await expect.element(notice).toHaveTextContent(/^Sovellus päivitetty: /)
    expect(notice.element()).toHaveTextContent(
      /^Sovellus päivitetty: 1\.10\.3 \(\d{2}\.\d{2}\.\d{4} klo \d{2}:\d{2}\)$/
    )
  })
})
