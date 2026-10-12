import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { render, screen } from '@testing-library/react'
import i18n from 'i18next'
import { Provider } from 'jotai'
import { Suspense } from 'react'
import { useLocation } from 'react-router'
import { eventWithStaticDates } from '../__mockData__/events'
import { registrationWithStaticDates } from '../__mockData__/registrations'
import { getEvent } from '../api/event'
import { getRegistration } from '../api/registration'
import theme from '../assets/Theme'
import { useRegistrationLanguage } from '../hooks/useRegistrationLanguage'
import { locales } from '../i18n'
import { languageStorageKey } from '../lib/client/storage'
import { invitationAttachmentFileName } from '../lib/fileName'
import { Path } from '../routeConfig'
import { DataMemoryRouter, flushPromises } from '../test-utils/utils'
import AppSnackbarProvider from './components/AppSnackbarProvider'
import { LoadingPage } from './LoadingPage'
import { loader, Component as RegistrationInvitation } from './RegistrationInvitation'

// Mock dependencies
vi.mock('../api/event')
vi.mock('../api/registration')

describe('RegistrationInvitation', () => {
  beforeAll(() => vi.useFakeTimers())
  afterEach(async () => {
    vi.runOnlyPendingTimers()
    // The language a test switches to is kept in localStorage and i18next; the next test starts in Finnish.
    localStorage.clear()
    // The language each registration was settled in for this tab (KOE-1512).
    sessionStorage.clear()
    document.documentElement.lang = 'fi'
    await i18n.changeLanguage('fi')
  })
  afterAll(() => vi.useRealTimers())

  it('renders loading indicator while loader is pending', async () => {
    const path = Path.invitation(registrationWithStaticDates)
    const routes: RouteObject[] = [
      {
        element: <RegistrationInvitation />,
        hydrateFallbackElement: <>hydrate fallback</>,
        loader: async () => ({
          data: new Promise(() => {}),
        }),
        path,
      },
    ]

    render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<LoadingPage />}>
              <AppSnackbarProvider>
                <DataMemoryRouter initialEntries={[path]} routes={routes} />
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('redirects to registration page when no invitation URL is available', async () => {
    const path = Path.invitation(registrationWithStaticDates)
    const routes: RouteObject[] = [
      {
        element: <RegistrationInvitation />,
        hydrateFallbackElement: <>hydrate fallback</>,
        loader: async () => ({
          data: Promise.resolve({
            event: eventWithStaticDates,
            registration: registrationWithStaticDates,
          }),
        }),
        path,
      },
      {
        element: <>registration-page</>,
        path: 'r/:id/:registrationId',
      },
    ]

    render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<LoadingPage />}>
              <AppSnackbarProvider>
                <DataMemoryRouter initialEntries={[path]} routes={routes} />
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(screen.getByText('registration-page')).toBeInTheDocument()
  })

  it('keeps the admin mark through the redirect, so the registration page keeps the language (KOE-1512)', async () => {
    localStorage.setItem(languageStorageKey, JSON.stringify('fi'))
    const registration = { ...registrationWithStaticDates, language: 'en' as const }
    const path = `${Path.invitation(registration)}?from=admin`
    // The registration page as far as the language goes: the hook it calls, on the address it lands on.
    const RegistrationPage = () => {
      useRegistrationLanguage(registration)
      return <>registration-page{useLocation().search}</>
    }
    const routes: RouteObject[] = [
      {
        element: <RegistrationInvitation />,
        hydrateFallbackElement: <>hydrate fallback</>,
        loader: async () => ({ data: Promise.resolve({ event: eventWithStaticDates, registration }) }),
        path: 'r/:id/:registrationId/invitation',
      },
      {
        element: <RegistrationPage />,
        path: 'r/:id/:registrationId',
      },
    ]

    render(
      <Provider>
        <Suspense fallback={<LoadingPage />}>
          <DataMemoryRouter initialEntries={[path]} routes={routes} />
        </Suspense>
      </Provider>
    )
    await flushPromises()

    expect(i18n.language).toBe('fi')
    expect(localStorage.getItem(languageStorageKey)).toBe(JSON.stringify('fi'))
    expect(screen.getByText('registration-page?from=admin')).toBeInTheDocument()
  })

  it('renders invitation page when URL is available', async () => {
    const invitationUrl = '/test-invitation-url'
    const path = Path.invitation(registrationWithStaticDates)
    const routes: RouteObject[] = [
      {
        element: <RegistrationInvitation />,
        hydrateFallbackElement: <>hydrate fallback</>,
        loader: async () => ({
          data: Promise.resolve({
            event: eventWithStaticDates,
            registration: {
              ...registrationWithStaticDates,
              invitationAttachmentUpdatedAt: new Date('2026-07-28T10:00:00.000Z'),
            },
            url: invitationUrl,
          }),
        }),
        path,
      },
    ]

    render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<LoadingPage />}>
              <AppSnackbarProvider>
                <DataMemoryRouter initialEntries={[path]} routes={routes} />
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()

    // Check that event information is displayed
    expect(screen.getByText(eventWithStaticDates.eventType, { exact: false })).toBeInTheDocument()

    // Check that dog information is displayed
    expect(screen.getByText(String(registrationWithStaticDates.dog.name), { exact: false })).toBeInTheDocument()

    // Check that handler information is displayed
    expect(screen.getByText(registrationWithStaticDates?.handler?.name ?? 'UNDEFINED!')).toBeInTheDocument()

    // Check that buttons are displayed
    expect(screen.getByText('invitation.open')).toBeInTheDocument()
    expect(screen.getByText('invitation.download')).toBeInTheDocument()
    expect(screen.getByText('invitation.attachmentUpdated date')).toBeInTheDocument()

    // Check that links have correct URLs
    const openButton = screen.getByText('invitation.open').closest('a')
    const downloadButton = screen.getByText('invitation.download').closest('a')

    expect(openButton).toHaveAttribute('href', invitationUrl)
    expect(downloadButton).toHaveAttribute('href', `${invitationUrl}?dl`)
    expect(downloadButton).toHaveAttribute('download', invitationAttachmentFileName(registrationWithStaticDates))
  })

  it('shows the page in the registration language over the stored one (KOE-1508)', async () => {
    localStorage.setItem(languageStorageKey, JSON.stringify('fi'))
    vi.mocked(getEvent).mockResolvedValueOnce({
      ...eventWithStaticDates,
      name: 'Kesäkoe',
      names: { en: 'Summer trial', fi: 'Kesäkoe' },
    })
    vi.mocked(getRegistration).mockResolvedValueOnce({
      ...registrationWithStaticDates,
      invitationAttachment: 'attachment-id',
      invitationRead: true,
      language: 'en',
    })
    const path = Path.invitation(registrationWithStaticDates)
    const routes: RouteObject[] = [
      {
        element: <RegistrationInvitation />,
        hydrateFallbackElement: <>hydrate fallback</>,
        loader,
        path: 'r/:id/:registrationId/invitation',
      },
    ]

    render(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<LoadingPage />}>
              <AppSnackbarProvider>
                <DataMemoryRouter initialEntries={[path]} routes={routes} />
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )
    await flushPromises()

    expect(screen.getByText('invitation.open')).toBeInTheDocument()
    // The texts follow i18next; the event name, <html lang>, the language menu and App's MUI and
    // date locales follow the stored choice, so all of them have to say English.
    expect(i18n.language).toBe('en')
    expect(screen.getByText('(Summer trial)', { exact: false })).toBeInTheDocument()
    expect(localStorage.getItem(languageStorageKey)).toBe(JSON.stringify('en'))
    expect(document.documentElement.lang).toBe('en')
  })
})
