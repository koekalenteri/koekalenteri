import CssBaseline from '@mui/material/CssBaseline'
import { ThemeProvider } from '@mui/material/styles'
import i18n from 'i18next'
import { SnackbarProvider } from 'notistack'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import ServiceWorkerUpdateNotifier from './ServiceWorkerUpdateNotifier'

// The key activateServiceWorkerUpdate stores the version change under before the reload.
const updatedSessionKey = 'service-worker-updated'

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

// After the update's reload i18next boots on the fallback language, and App realigns it with the
// stored choice only in its own effect, which React runs after the notifier's. The notice is
// enqueued while i18next is still Finnish, so it must follow the language once App switches it
// (KOE-1457).
describe('ServiceWorkerUpdateNotifier', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('fi')
  })

  afterEach(async () => {
    window.sessionStorage.clear()
    await i18n.changeLanguage('fi')
  })

  it('shows the version change in the language App switches to after the notice was enqueued', async () => {
    window.sessionStorage.setItem(updatedSessionKey, JSON.stringify({ from: '1.10.2', to: '1.10.3' }))

    const screen = await renderNotifier()
    await expect.element(screen.getByText('Sovellus päivitetty: 1.10.2 → 1.10.3')).toBeVisible()

    document.documentElement.lang = 'en'
    await i18n.changeLanguage('en')

    await expect.element(screen.getByText('App updated: 1.10.2 → 1.10.3')).toBeVisible()
    await expect.element(screen.getByRole('link', { name: "See what's new" })).toBeVisible()

    // The snackbar grows in over 225ms; the capture must wait out that transition.
    await new Promise((resolve) => setTimeout(resolve, 400))

    await expect(screen.getByRole('alert')).toMatchScreenshot('update-notice-en')
  })

  it('shows the build time notice in the language App switches to after the notice was enqueued', async () => {
    window.sessionStorage.setItem(updatedSessionKey, JSON.stringify({ from: '1.10.3', to: '1.10.3' }))

    const screen = await renderNotifier()
    await expect.element(screen.getByText(/^Sovellus päivitetty: 1\.10\.3 \(.+ klo .+\)$/)).toBeVisible()

    document.documentElement.lang = 'en'
    await i18n.changeLanguage('en')

    // The build time follows the runner's timezone, so only the shape around it is asserted.
    await expect.element(screen.getByText(/^App updated: 1\.10\.3 \(\d{2}\.\d{2}\.\d{4} \d{2}:\d{2}\)$/)).toBeVisible()
  })
})
