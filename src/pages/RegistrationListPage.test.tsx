import type { RouteObject } from 'react-router'
import { ThemeProvider } from '@mui/material'
import { LocalizationProvider } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { act, fireEvent, screen } from '@testing-library/react'
import i18n from 'i18next'
import { createStore, Provider } from 'jotai'
import { enqueueSnackbar } from 'notistack'
import { Suspense } from 'react'
import { Link, useLocation, useParams } from 'react-router'
import {
  eventWithParticipantsInvited,
  eventWithStaticDates,
  eventWithStaticDatesAndClass,
} from '../__mockData__/events'
import { paymentPictureWith } from '../__mockData__/paymentPicture'
import {
  registrationWithStaticDates,
  registrationWithStaticDatesAndClass,
  unpaidRegistrationWithStaticDates,
} from '../__mockData__/registrations'
import * as eventApi from '../api/event'
import { APIError } from '../api/http'
import * as registrationApi from '../api/registration'
import theme from '../assets/Theme'
import { locales } from '../i18n'
import { languageStorageKey } from '../lib/client/storage'
import { Path } from '../routeConfig'
import { DataMemoryRouter, flushPromises, renderSuspended, renderSuspendedWithUserEvents } from '../test-utils/utils'
import AppSnackbarProvider from './components/AppSnackbarProvider'
import { PaymentPageWithData } from './PaymentPage'
import { RegistrationListPage } from './RegistrationListPage'
import { languageAtom } from './state'

vi.mock('../lib/client/navigation', async () => ({
  redirectTo: vi.fn(),
}))

import { redirectTo } from '../lib/client/navigation'

// Mock the API modules
vi.mock('../api/user')
vi.mock('../api/event')
vi.mock('../api/eventType')
vi.mock('../api/judge')
vi.mock('../api/official')
vi.mock('../api/organizer')
vi.mock('../api/registration')
vi.mock('../hooks/useRegistrationSubscription', async () => ({ useRegistrationSubscription: vi.fn() }))

// Mock the enqueueSnackbar function
vi.mock('notistack', async () => ({
  ...(await vi.importActual<typeof import('notistack')>('notistack')),
  enqueueSnackbar: vi.fn(),
}))

/**
 * The payment page as far as the language is concerned: the loader's work is not under test here, so
 * the page gets the same registration the registration page read and no event, and a way back that
 * goes where the payment page's own goBack goes.
 */
const PaymentStub = () => {
  const { id = '', registrationId = '' } = useParams()
  const registration = {
    ...unpaidRegistrationWithStaticDates,
    eventId: id,
    id: registrationId,
    language: 'en' as const,
    payment: paymentPictureWith({ canPay: true, due: 123, standing: false, status: 'unpaid' }),
  }
  return (
    <>
      <PaymentPageWithData registrationId={registrationId} event={null} registration={registration} />
      <Link to={Path.registration(registration)}>goBack</Link>
    </>
  )
}

/** What the server's picture says of a place that owes its fee. */
const owing = paymentPictureWith({ canPay: true, due: 123, standing: false, status: 'unpaid' })

/** Shows where the saved route redirected to. */
const LocationProbe = () => {
  const { pathname, search } = useLocation()
  return <>{`at ${pathname}${search}`}</>
}

describe('RegistrationListPage', () => {
  // The fixture trial ended 11.2.2021. A test that names no day of its own runs the day after: the
  // entry is past changing, and its fee still payable (KOE-1589).
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2021-02-12T12:00:00.000+02:00'))
  })

  afterEach(async () => {
    localStorage.clear()
    sessionStorage.clear()
    // A test that switches the language leaves it in i18next and <html lang>; the next one starts in Finnish.
    document.documentElement.lang = 'fi'
    await i18n.changeLanguage('fi')
    vi.restoreAllMocks()
    // The API mocks are vi.fn: a spy's mockResolvedValue stays on them until reset to their own body.
    vi.resetAllMocks()
    vi.useRealTimers()
  })

  // Helper function to render the component with router
  const renderWithRouter = async (
    path: string,
    props: { cancel?: boolean; confirm?: boolean; invitation?: boolean } = {},
    store?: ReturnType<typeof createStore>
  ) => {
    const routes: RouteObject[] = [
      {
        element: <RegistrationListPage {...props} />,
        path: '/r/:id/:registrationId',
      },
      {
        element: <RegistrationListPage {...props} />,
        path: '/r/:id/:registrationId/access/:editToken',
      },
      {
        element: <PaymentStub />,
        path: '/p/:id/:registrationId',
      },
      {
        element: <RegistrationListPage cancel={true} />,
        path: '/r/:id/:registrationId/cancel',
      },
      {
        element: <RegistrationListPage confirm={true} />,
        path: '/r/:id/:registrationId/confirm',
      },
      {
        element: <RegistrationListPage invitation={true} />,
        path: '/r/:id/:registrationId/invitation',
      },
      {
        element: <RegistrationListPage />,
        path: '/r/:id/:registrationId/saved',
      },
      {
        element: <>Payment Page</>,
        path: '/payment/:id/:registrationId',
      },
      {
        element: <>Invitation Attachment</>,
        path: '/invitation-attachment/:id/:registrationId',
      },
    ]

    const result = await renderSuspendedWithUserEvents(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider store={store}>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <DataMemoryRouter initialEntries={[path]} routes={routes} />
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>,
      undefined,
      { advanceTimers: vi.advanceTimersByTime }
    )

    return {
      ...result,
    }
  }

  it('renders the page with all components', async () => {
    await renderWithRouter('/r/test1/nou-registration')

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    // Check that the main components are rendered
    expect(screen.getByText('registration.registeredDogs')).toBeInTheDocument()
  })

  // A page that has nothing to show still has a name for a screen reader (KOE-1519).
  it.each([
    ['/r/no-such-event/nou-registration', 'error.eventNotFound'],
    ['/r/test1/no-such-registration', 'error.registrationNotFound'],
  ])('names the page when %s has nothing to show', async (path, message) => {
    await renderWithRouter(path)
    await flushPromises()

    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'entryList' })).toBeInTheDocument()
  })

  it.each(['/r/test1/nou-registration', '/r/test1/nou-registration/access/edit-token'])(
    'shows the page opened from an email link (%s) in the registration language (KOE-1508, KOE-1512)',
    async (path) => {
      localStorage.setItem(languageStorageKey, JSON.stringify('fi'))
      vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
        ...registrationWithStaticDates,
        language: 'en',
        payment: paymentPictureWith(),
      })

      await renderWithRouter(path)
      await flushPromises()

      expect(i18n.language).toBe('en')
      expect(localStorage.getItem(languageStorageKey)).toBe(JSON.stringify('en'))
      expect(document.documentElement.lang).toBe('en')
    }
  )

  it.each([
    // The registration dialog's link
    '/r/test1/nou-registration?from=admin',
    // A link in the email preview that the template appends to
    '/r/test1/nou-registration/cancel?from=admin',
    // The preview's payment link
    '/p/test1/nou-registration?from=admin',
  ])('keeps the reader language when the registration is opened from the admin side (%s, KOE-1512)', async (path) => {
    localStorage.setItem(languageStorageKey, JSON.stringify('fi'))
    vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
      ...registrationWithStaticDates,
      language: 'en',
      payment: paymentPictureWith(),
    })

    await renderWithRouter(path)
    await flushPromises()

    // The page is there (the payment page has no event in this file), in the reader's language.
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()
    expect(i18n.language).toBe('fi')
    expect(localStorage.getItem(languageStorageKey)).toBe(JSON.stringify('fi'))
    expect(document.documentElement.lang).toBe('fi')
  })

  it('keeps a language picked from the menu after the switch, here and on the payment page (KOE-1512)', async () => {
    localStorage.setItem(languageStorageKey, JSON.stringify('fi'))
    vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
      ...unpaidRegistrationWithStaticDates,
      language: 'en',
      payment: owing,
    })
    const store = createStore()

    const { user } = await renderWithRouter('/r/test1/unpaid-nou-registration', {}, store)
    await flushPromises()
    expect(i18n.language).toBe('en')

    // The reader picks Finnish from the language menu.
    act(() => store.set(languageAtom, 'fi'))
    await flushPromises()
    expect(i18n.language).toBe('fi')

    await user.click(screen.getByRole('button', { name: 'registration.cta.pay' }))
    await flushPromises()
    expect(screen.getByText('error.eventNotFound')).toBeInTheDocument()
    expect(i18n.language).toBe('fi')

    await user.click(screen.getByRole('link', { name: 'goBack' }))
    await flushPromises()
    expect(screen.getByText('registration.registeredDogs')).toBeInTheDocument()
    expect(i18n.language).toBe('fi')
    expect(localStorage.getItem(languageStorageKey)).toBe(JSON.stringify('fi'))
  })

  it('keeps editing and cancelling behind the row menu', async () => {
    const { user } = await renderWithRouter('/r/test1/nou-registration')
    await flushPromises()

    // Not on the row as bare icons any more (KOE-973): the red cross was read as a payment mark and
    // an entrant paid the same place twice over it. Nothing but the menu button until it is opened.
    expect(screen.queryByRole('menuitem', { name: 'registration.actions.edit' })).not.toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'registration.actions.cancel' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'more' }))

    expect(await screen.findByRole('menuitem', { name: 'registration.actions.edit' })).toBeVisible()
    expect(screen.getByRole('menuitem', { name: 'registration.actions.cancel' })).toBeVisible()
  })

  // The page follows the shared rule (KOE-1584): it closes once the trial's last Finnish day has gone
  // (test1 runs 10.-11.2.2021, entry closed 7.2.), not when that day begins. The day is the key and
  // today is Finland's: 22:30 UTC on 10.2. is already 11.2. there (KOE-1547). Editing alone also
  // stays closed between the close of entry and the trial, when confirming and cancelling are open.
  it.each([
    ['between the close of entry and the trial', '2021-02-08T12:00:00.000+02:00', true],
    ['on the first day', '2021-02-10T12:00:00.000+02:00', false],
    ['on the last day', '2021-02-11T12:00:00.000+02:00', false],
    ['on the last day, late in the UTC evening before it', '2021-02-10T22:30:00.000Z', false],
    ['the day after the last day', '2021-02-12T00:00:01.000+02:00', true],
  ])('closes editing %s: %s', async (_label, now, closed) => {
    vi.setSystemTime(new Date(now))
    const { user } = await renderWithRouter('/r/test1/nou-registration')
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'more' }))

    const edit = await screen.findByRole('menuitem', { name: 'registration.actions.edit' })
    if (closed) expect(edit).toHaveAttribute('aria-disabled', 'true')
    else expect(edit).not.toHaveAttribute('aria-disabled', 'true')
  })

  // Cancelling stays in the menu after editing has closed, and from the day before the trial it is
  // the secretary's: the dialog names their contact instead of taking a reason (KOE-1584).
  it.each([
    ['between the close of entry and the trial', '2021-02-08T12:00:00.000+02:00', 'own'],
    ['on the day before the trial', '2021-02-09T12:00:00.000+02:00', 'late'],
    ['on the last day', '2021-02-11T12:00:00.000+02:00', 'late'],
    ['the day after the last day', '2021-02-12T12:00:00.000+02:00', 'closed'],
  ] as const)('offers cancelling %s: %s', async (_label, now, cancelling) => {
    vi.setSystemTime(new Date(now))
    const { user } = await renderWithRouter('/r/test1/nou-registration')
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'more' }))
    const cancel = await screen.findByRole('menuitem', { name: 'registration.actions.cancel' })
    if (cancelling === 'closed') {
      expect(cancel).toHaveAttribute('aria-disabled', 'true')
      return
    }
    expect(cancel).not.toHaveAttribute('aria-disabled', 'true')

    await user.click(cancel)
    expect(await screen.findByRole('dialog', { name: 'registration.cancelDialog.title' })).toBeVisible()
    const late = screen.queryByText('registration.cancelDialog.lateText contact, event, registration')
    const cta = screen.queryByRole('button', { name: 'registration.cancelDialog.cta' })
    if (cancelling === 'late') {
      expect(late).toBeInTheDocument()
      expect(screen.queryByLabelText('registration.cancelDialog.reason')).not.toBeInTheDocument()
      expect(cta).not.toBeInTheDocument()
    } else {
      expect(late).not.toBeInTheDocument()
      expect(screen.getByLabelText('registration.cancelDialog.reason')).toBeInTheDocument()
      expect(cta).toBeInTheDocument()
    }
  })

  it.each([
    ['entry has closed and the trial is ahead', '2021-02-08T12:00:00.000+02:00', true],
    ['the trial ends tomorrow', '2021-02-10T12:00:00.000+02:00', true],
    ['the trial ends today', '2021-02-11T12:00:00.000+02:00', true],
    ['the trial ended yesterday', '2021-02-12T12:00:00.000+02:00', false],
  ])('opens the confirm dialog on the confirm route when %s: %s', async (_label, now, opens) => {
    vi.setSystemTime(new Date(now))
    await renderWithRouter('/r/test1/nou-registration/confirm')
    await flushPromises()

    const dialog = screen.queryByRole('dialog', { name: 'registration.confirmDialog.title' })
    if (opens) expect(dialog).toBeVisible()
    else expect(dialog).not.toBeInTheDocument()
  })

  // A judged class closes its entries before the last day is over, as on the secretary's side (KOE-1388).
  describe.each(['ended', 'completed'] as const)('when the class is %s', (state) => {
    beforeEach(() => {
      vi.setSystemTime(new Date('2021-02-10T12:00:00.000+02:00'))
      vi.spyOn(eventApi, 'getEvent').mockResolvedValue({ ...eventWithStaticDates, state })
    })

    it('closes editing', async () => {
      const { user } = await renderWithRouter('/r/test1/nou-registration')
      await flushPromises()

      await user.click(screen.getByRole('button', { name: 'more' }))

      expect(await screen.findByRole('menuitem', { name: 'registration.actions.edit' })).toHaveAttribute(
        'aria-disabled',
        'true'
      )
    })

    it('does not open the confirm dialog on the confirm route', async () => {
      await renderWithRouter('/r/test1/nou-registration/confirm')
      await flushPromises()

      expect(screen.queryByRole('dialog', { name: 'registration.confirmDialog.title' })).not.toBeInTheDocument()
    })
  })

  // The entry's own class decides, not the event's state: ALO has been judged on the first day while
  // AVO still runs on the second (KOE-1584).
  it.each([
    ['closes', 'ALO', true],
    ['keeps open', 'AVO', false],
  ] as const)('%s editing for an entry in %s once ALO has ended', async (_label, eventClass, closed) => {
    vi.setSystemTime(new Date('2021-02-10T12:00:00.000+02:00'))
    vi.spyOn(eventApi, 'getEvent').mockResolvedValue({
      ...eventWithStaticDatesAndClass,
      classes: [
        { class: 'ALO', date: '2021-02-10', state: 'ended' },
        { class: 'AVO', date: '2021-02-11', state: 'started' },
      ],
      state: 'started',
    })
    vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
      ...registrationWithStaticDatesAndClass,
      class: eventClass,
      payment: paymentPictureWith(),
    })
    const { user } = await renderWithRouter(
      `/r/${registrationWithStaticDatesAndClass.eventId}/${registrationWithStaticDatesAndClass.id}`
    )
    await flushPromises()

    await user.click(screen.getByRole('button', { name: 'more' }))

    const edit = await screen.findByRole('menuitem', { name: 'registration.actions.edit' })
    if (closed) expect(edit).toHaveAttribute('aria-disabled', 'true')
    else expect(edit).not.toHaveAttribute('aria-disabled', 'true')
  })

  // KOE-1589: the trial ended 11.2.2021. Paying stays open through the 7th day after it, while
  // confirming and the koekutsu close with the trial.
  describe('in the week after the trial', () => {
    it.each([
      ['2021-02-18T23:59:00.000+02:00', true],
      ['2021-02-19T00:00:01.000+02:00', false],
    ])('at %s offers paying: %s', async (now, offered) => {
      vi.setSystemTime(new Date(now))
      vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
        ...unpaidRegistrationWithStaticDates,
        payment: owing,
      })
      const { user } = await renderWithRouter('/r/test1/unpaid-nou-registration')
      await flushPromises()

      const rowPay = screen.getByRole('button', { name: 'registration.actions.pay' })
      const infoBoxPay = screen.queryByRole('button', { name: 'registration.cta.pay' })
      if (!offered) {
        expect(rowPay).toBeDisabled()
        expect(infoBoxPay).not.toBeInTheDocument()
        return
      }
      expect(rowPay).toBeEnabled()
      expect(infoBoxPay).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'registration.cta.pay' }))
      await flushPromises()
      expect(screen.getByText('error.eventNotFound')).toBeInTheDocument()
    })

    it.each([
      ['2021-02-18T23:59:00.000+02:00', true],
      ['2021-02-19T00:00:01.000+02:00', false],
    ])('at %s opens the payment dialog for a picked place: %s', async (now, opens) => {
      vi.setSystemTime(new Date(now))
      vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
        ...unpaidRegistrationWithStaticDates,
        messagesSent: { picked: true },
        payment: owing,
      })
      await renderWithRouter('/r/test1/unpaid-nou-registration')
      await flushPromises()

      const dialog = screen.queryByRole('dialog', { name: 'registration.paymentDialog.title' })
      if (opens) expect(dialog).toBeVisible()
      else expect(dialog).not.toBeInTheDocument()
    })

    it.each([
      ['2021-02-11T12:00:00.000+02:00', true],
      ['2021-02-12T12:00:00.000+02:00', false],
    ])('at %s offers confirming a picked place: %s', async (now, offered) => {
      vi.setSystemTime(new Date(now))
      vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
        ...registrationWithStaticDates,
        messagesSent: { picked: true },
        payment: paymentPictureWith(),
      })
      await renderWithRouter('/r/test1/nou-registration')
      await flushPromises()

      const confirm = screen.queryByRole('button', { name: 'registration.confirmDialog.cta' })
      if (offered) expect(confirm).toBeInTheDocument()
      else expect(confirm).not.toBeInTheDocument()
    })

    it('neither reads nor marks the koekutsu on the invitation route', async () => {
      const patchRegistrationSpy = vi.spyOn(registrationApi, 'patchRegistration')
      vi.setSystemTime(new Date('2021-02-12T12:00:00.000+02:00'))

      await renderWithRouter('/r/test1/nou-registration/invitation')
      await flushPromises()
      await flushPromises()

      expect(patchRegistrationSpy).not.toHaveBeenCalled()
      expect(screen.getByText('registration.registeredDogs')).toBeInTheDocument()
    })
  })

  it('itemizes what the registration bought and what has been paid for it', async () => {
    await renderWithRouter('/r/test1/nou-registration')
    await flushPromises()

    // KOE-1055: the event's price list is not an answer to "what did I buy, and at what price".
    expect(screen.getByText('paymentDetails')).toBeInTheDocument()
    expect(screen.getByText('costTotal')).toBeInTheDocument()
    expect(screen.getByText('registration.paid')).toBeInTheDocument()
    // The fee, the total, and the same sum again as what has already been paid of it
    expect(screen.getAllByText('123,00 €')).toHaveLength(3)
  })

  it('opens cancel dialog when on cancel route', async () => {
    // allow couple of minutes margin for timers
    vi.setSystemTime(new Date('2021-02-08T23:55:00.000+02:00')) // must be before event.endDate
    await renderWithRouter('/r/test1/nou-registration/cancel')

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = await screen.findByRole('dialog', { name: 'registration.cancelDialog.title' })
    expect(dialog).toBeVisible()
    expect(
      screen.queryByText('registration.cancelDialog.lateText contact, event, registration')
    ).not.toBeInTheDocument()
    expect(screen.getByLabelText('registration.cancelDialog.reason')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'registration.cancelDialog.cta' })).toBeInTheDocument()
  })

  it('opens cancel dialog when on cancel route (late)', async () => {
    vi.setSystemTime(new Date('2021-02-09T00:00:01.000+02:00')) // one second after cancellation closes
    await renderWithRouter('/r/test1/nou-registration/cancel')

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = await screen.findByRole('dialog', { name: 'registration.cancelDialog.title' })
    expect(dialog).toBeVisible()
    expect(screen.getByText('registration.cancelDialog.lateText contact, event, registration')).toBeInTheDocument()
    expect(screen.queryByLabelText('registration.cancelDialog.reason')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'registration.cancelDialog.cta' })).not.toBeInTheDocument()
  })

  it('opens confirm dialog when on confirm route', async () => {
    vi.setSystemTime(new Date('2021-02-08')) // must be before event.endDate
    await renderWithRouter('/r/test1/nou-registration/confirm')

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const confirmButton = await screen.findByRole('button', { name: 'registration.confirmDialog.cta' })
    expect(confirmButton).toBeInTheDocument()
  })

  it('opens confirm dialog from the registration details page when confirmation is pending', async () => {
    vi.setSystemTime(new Date('2021-02-08'))
    vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
      ...registrationWithStaticDates,
      messagesSent: { picked: true },
      payment: paymentPictureWith(),
    })

    const { user } = await renderWithRouter('/r/test1/nou-registration')

    await flushPromises()

    expect(screen.getByText('registration.status.placeOffered')).toBeInTheDocument()
    const confirmButton = screen.getByRole('button', { name: 'registration.confirmDialog.cta' })
    await user.click(confirmButton)

    expect(screen.getByRole('dialog', { name: 'registration.confirmDialog.title' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'cancel' }))
  })

  it('shows loading instead of event not found while confirm route event fetch is pending', async () => {
    vi.setSystemTime(new Date('2021-02-08')) // must be before event.endDate
    vi.spyOn(eventApi, 'getEvent').mockReturnValue(new Promise(() => {}) as never)
    vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
      ...registrationWithStaticDates,
      eventId: 'pending-event',
      payment: paymentPictureWith(),
    })

    await renderWithRouter('/r/pending-event/nou-registration/confirm')

    await flushPromises()

    expect(screen.queryByText('loading...')).not.toBeInTheDocument()
    expect(screen.queryByText('error.eventNotFound')).not.toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('handles cancel action when cancel dialog is submitted', async () => {
    vi.setSystemTime(new Date('2021-02-08')) // must be at leaset 1 days before event start
    const patchRegistrationSpy = vi
      .spyOn(registrationApi, 'patchRegistration')
      .mockResolvedValueOnce({ ...registrationWithStaticDates, cancelled: true, cancelReason: 'dog-heat' })

    const { user } = await renderWithRouter('/r/test1/nou-registration/cancel')

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = screen.getByRole('dialog', { name: 'registration.cancelDialog.title' })
    expect(dialog).toBeVisible()

    const cancelButton = await screen.findByRole('button', { name: 'registration.cancelDialog.cta' })
    expect(cancelButton).toBeInTheDocument()

    const reasonSelect = screen.getByLabelText('registration.cancelDialog.reason')
    await user.click(reasonSelect)

    await flushPromises()

    const option = await screen.findByRole('option', { name: 'registration.cancelReason.dog-heat' })
    expect(option).toBeVisible()
    await user.click(option)

    await flushPromises()

    expect(cancelButton).toBeEnabled()
    await user.click(cancelButton)

    await flushPromises()

    expect(patchRegistrationSpy).toHaveBeenCalledTimes(1)
  })

  it('handles confirm action when confirm dialog is submitted', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    const confirmRequest = new Promise((resolve) =>
      setTimeout(() => resolve({ ...unpaidRegistrationWithStaticDates, confirmed: true }), 1000)
    )
    const patchRegistrationSpy = vi.spyOn(registrationApi, 'patchRegistration').mockReturnValue(confirmRequest as never)

    vi.setSystemTime(new Date('2021-02-08')) // must be before event.endDate
    await renderWithRouter('/r/test1/nou-registration/confirm')

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    // The confirm dialog should be open
    const dialog = screen.getByRole('dialog', { name: 'registration.confirmDialog.title' })
    expect(dialog).toBeVisible()

    const confirmButton = screen.getByRole('button', { name: 'registration.confirmDialog.cta' })
    expect(confirmButton).toBeEnabled()
    fireEvent.click(confirmButton)

    expect(confirmButton).toBeDisabled()

    expect(patchRegistrationSpy).toHaveBeenCalledTimes(1)

    await act(async () => vi.advanceTimersByTime(1000))

    await flushPromises()

    expect(dialog).not.toBeVisible()

    patchRegistrationSpy.mockRestore()
  })

  it('handles 304 from confirm action as a successful no-op', async () => {
    const patchRegistrationSpy = vi
      .spyOn(registrationApi, 'patchRegistration')
      .mockRejectedValue(new APIError(new Response(null, { status: 304, statusText: 'Not Modified' }), ''))
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    vi.setSystemTime(new Date('2021-02-08'))
    const { user } = await renderWithRouter('/r/test1/nou-registration/confirm')

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = screen.getByRole('dialog', { name: 'registration.confirmDialog.title' })
    const confirmButton = screen.getByRole('button', { name: 'registration.confirmDialog.cta' })

    await user.click(confirmButton)
    await flushPromises()

    expect(patchRegistrationSpy).toHaveBeenCalledTimes(1)
    expect(dialog).not.toBeVisible()
    expect(consoleErrorSpy).not.toHaveBeenCalled()

    consoleErrorSpy.mockRestore()
    patchRegistrationSpy.mockRestore()
  })

  it('handles invitation read when on invitation route', async () => {
    const patchRegistrationSpy = vi.spyOn(registrationApi, 'patchRegistration')

    vi.setSystemTime(new Date('2021-02-08')) // must be before event.endDate
    await renderWithRouter('/r/test1/nou-registration/invitation')

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    // Wait for the action to complete
    await flushPromises()

    expect(patchRegistrationSpy).toHaveBeenCalledWith(
      {
        eventId: 'test1',
        id: 'nou-registration',
        operations: [{ path: ['invitationRead'], type: 'CREATE', value: true }],
      },
      undefined,
      undefined
    )
  })

  it('shows snackbar when on saved route with payment success', async () => {
    const routes: RouteObject[] = [
      {
        element: <RegistrationListPage />,
        path: '/r/:id/:registrationId/saved',
      },
      {
        element: <>Registration Page</>,
        path: '/r/:id/:registrationId',
      },
    ]

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <DataMemoryRouter initialEntries={['/r/test1/nou-registration/saved']} routes={routes} />
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    await flushPromises()

    expect(enqueueSnackbar).toHaveBeenCalledWith('registration.saved count, to', {
      style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' },
      variant: 'success',
    })
    expect(screen.getByText('Registration Page')).toBeInTheDocument()
  })

  it('closes cancel dialog when close button is clicked', async () => {
    const { user } = await renderWithRouter('/r/test1/nou-registration/cancel')

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = screen.getByRole('dialog', { name: 'registration.cancelDialog.title' })
    expect(dialog).toBeVisible()

    const closeButton = screen.getByRole('button', { name: 'close' })
    await user.click(closeButton)

    await flushPromises()

    expect(dialog).not.toBeVisible()
  })

  it('closes confirm dialog when close button is clicked', async () => {
    vi.setSystemTime(new Date('2021-02-08')) // must be before event.endDate

    const { user } = await renderWithRouter('/r/test1/nou-registration/confirm')

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = screen.getByRole('dialog', { name: 'registration.confirmDialog.title' })
    expect(dialog).toBeVisible()

    // Click the close button
    const closeButton = screen.getByRole('button', { name: 'cancel' })
    await user.click(closeButton)

    await flushPromises()

    expect(dialog).not.toBeVisible()
  })

  it('opens payment dialog automatically', async () => {
    // GetRegistration offers paying to a picked place that owes its fee (KOE-1526).
    vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
      ...unpaidRegistrationWithStaticDates,
      id: 'unpaid-picked-nou-registration',
      messagesSent: { picked: true },
      payment: owing,
    })
    await renderWithRouter('/r/test1/unpaid-picked-nou-registration')

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    const dialog = await screen.findByRole('dialog', { name: 'registration.paymentDialog.title' })
    expect(dialog).toBeVisible()
  })

  // KOE-1526: the owner's response carries no group, so the server says what is still owed.
  describe('a fee refunded to a reserve', () => {
    const refunded = {
      ...registrationWithStaticDates,
      refundAmount: 123,
      refundAt: registrationWithStaticDates.createdAt,
      refundHandlingCost: 0,
      refundStatus: 'SUCCESS' as const,
    }

    it('asks for nothing while the reserve has no place', async () => {
      vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
        ...refunded,
        payment: paymentPictureWith({ refundedAmount: 123, standing: false, status: 'refunded' }),
      })
      await renderWithRouter('/r/test1/nou-registration')
      await flushPromises()

      expect(screen.getByText('registration.refunded')).toBeInTheDocument()
      expect(screen.queryByText('registration.toBePaid')).not.toBeInTheDocument()
      expect(screen.getAllByText(/paymentStatus\.refunded/).length).toBeGreaterThan(0)
    })

    it('asks for the fee again once the reserve is lifted into a place', async () => {
      vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
        ...refunded,
        messagesSent: { picked: true },
        payment: paymentPictureWith({ ...owing, refundedAmount: 123 }),
      })
      await renderWithRouter('/r/test1/nou-registration')
      await flushPromises()

      const dialog = await screen.findByRole('dialog', { name: 'registration.paymentDialog.title' })
      expect(dialog).toBeVisible()
    })
  })

  // KOE-1526 review: the payment dialog opens on the same offer as the pay button, the server's
  // picture, and not while a payment is being verified.
  describe('the payment dialog follows the pay offer', () => {
    it('stays closed for a picked entry moved back to the reserve list when paying at confirmation', async () => {
      vi.spyOn(eventApi, 'getEvent').mockResolvedValue({ ...eventWithStaticDates, paymentTime: 'confirmation' })
      vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
        ...unpaidRegistrationWithStaticDates,
        messagesSent: { picked: true },
        payment: paymentPictureWith({ due: 123, standing: false, status: 'waitingForPlace' }),
      })
      await renderWithRouter('/r/test1/unpaid-nou-registration')
      await flushPromises()

      expect(screen.queryByRole('dialog', { name: 'registration.paymentDialog.title' })).not.toBeInTheDocument()
    })

    it('stays closed while a payment is being verified', async () => {
      vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
        ...unpaidRegistrationWithStaticDates,
        messagesSent: { picked: true },
        payment: owing,
      })
      await renderWithRouter('/r/test1/unpaid-nou-registration?payment=verifying')
      await flushPromises()

      expect(screen.queryByRole('dialog', { name: 'registration.paymentDialog.title' })).not.toBeInTheDocument()
    })
  })

  // A payment return keeps verifying until the picture has a payment standing or charged twice.
  const verifyingMessage = ['registration.notifications.paymentVerifying', { variant: 'info' }] as const

  it.each([
    ['a payment standing', paymentPictureWith()],
    ['a payment charged twice', paymentPictureWith({ due: 123, standing: false, status: 'duplicate' })],
  ])('stops verifying a payment return once the picture has %s', async (_name, payment) => {
    vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({ ...unpaidRegistrationWithStaticDates, payment })
    await renderWithRouter('/r/test1/unpaid-nou-registration?payment=verifying')
    await flushPromises()

    expect(enqueueSnackbar).not.toHaveBeenCalledWith(...verifyingMessage)
  })

  // A place paid, fully refunded, lifted into a place and not yet paid again has a stored SUCCESS but
  // no money standing: the page keeps waiting for the money (an intended change from reading the
  // stored status, which ended the wait at once).
  it('keeps verifying a payment return while no money stands, whatever the stored status says', async () => {
    vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
      ...unpaidRegistrationWithStaticDates,
      payment: owing,
      paymentStatus: 'SUCCESS',
    })
    await renderWithRouter('/r/test1/unpaid-nou-registration?payment=verifying')
    await flushPromises()

    expect(enqueueSnackbar).toHaveBeenCalledWith(...verifyingMessage)
  })

  // Where the saved route goes next: it keeps the verifying mark until the picture has money standing.
  it.each([
    [
      'no money stands, whatever the stored status says',
      owing,
      'at /r/test1/unpaid-nou-registration?payment=verifying',
    ],
    ['money stands', paymentPictureWith(), 'at /r/test1/unpaid-nou-registration'],
  ])('redirects from the saved route when %s', async (_name, payment, location) => {
    vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
      ...unpaidRegistrationWithStaticDates,
      payment,
      paymentStatus: 'SUCCESS',
    })
    const routes: RouteObject[] = [
      { element: <RegistrationListPage />, path: '/r/:id/:registrationId/saved' },
      { element: <LocationProbe />, path: '/r/:id/:registrationId' },
    ]
    await renderSuspended(
      <Provider>
        <Suspense fallback={<div>loading...</div>}>
          <AppSnackbarProvider>
            <DataMemoryRouter
              initialEntries={['/r/test1/unpaid-nou-registration/saved?payment=verifying']}
              routes={routes}
            />
          </AppSnackbarProvider>
        </Suspense>
      </Provider>
    )
    await flushPromises()

    expect(screen.getByText(location)).toBeInTheDocument()
  })

  // The divergent branch of the saved return: the stored status says SUCCESS, the picture says no money
  // stands (paid, fully refunded, lifted, not yet paid again), so no "paid" snackbar is shown.
  it('shows no paid snackbar on the saved route while no money stands, whatever the stored status says', async () => {
    vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue({
      ...registrationWithStaticDates,
      messagesSent: { picked: true },
      payment: owing,
      paymentStatus: 'SUCCESS',
    })
    await renderWithRouter('/r/test1/nou-registration/saved')
    await flushPromises()

    expect(enqueueSnackbar).not.toHaveBeenCalledWith(expect.stringContaining('registration.'), expect.anything())
  })

  // The server always sends the picture; a response without it gives the page nothing to say.
  it('stays on the loading page when the response has no payment picture', async () => {
    vi.spyOn(registrationApi, 'getRegistration').mockResolvedValue(unpaidRegistrationWithStaticDates)
    await renderWithRouter('/r/test1/unpaid-nou-registration')
    await flushPromises()

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
    expect(screen.queryByText('registration.registeredDogs')).not.toBeInTheDocument()
  })

  it('polls pending payment as a bounded websocket fallback', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const getRegistrationSpy = vi
      .spyOn(registrationApi, 'getRegistration')
      .mockResolvedValueOnce({
        ...unpaidRegistrationWithStaticDates,
        payment: paymentPictureWith({ due: 123, standing: false, status: 'inProgress' }),
      })
      .mockResolvedValue({
        ...unpaidRegistrationWithStaticDates,
        payment: paymentPictureWith(),
        paymentStatus: 'SUCCESS',
      })

    await renderWithRouter('/r/test1/unpaid-nou-registration')

    await flushPromises(false)
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    expect(getRegistrationSpy).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(10_000)
    expect(getRegistrationSpy).toHaveBeenCalledTimes(1)

    await act(async () => vi.advanceTimersByTime(20_000))

    expect(getRegistrationSpy).toHaveBeenCalledTimes(2)
    await flushPromises()

    getRegistrationSpy.mockRestore()
  })

  it('polls after a successful payment return as a bounded websocket fallback', async () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
    const getRegistrationSpy = vi
      .spyOn(registrationApi, 'getRegistration')
      .mockResolvedValueOnce({
        ...unpaidRegistrationWithStaticDates,
        payment: owing,
      })
      .mockResolvedValue({
        ...unpaidRegistrationWithStaticDates,
        payment: paymentPictureWith(),
        paymentStatus: 'SUCCESS',
      })

    await renderWithRouter('/r/test1/unpaid-nou-registration/saved?payment=verifying')

    await flushPromises(false)
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    expect(enqueueSnackbar).toHaveBeenCalledWith('registration.notifications.paymentVerifying', { variant: 'info' })
    expect(screen.queryByRole('button', { name: 'registration.cta.pay' })).not.toBeInTheDocument()
    expect(getRegistrationSpy).toHaveBeenCalledTimes(1)

    await act(async () => vi.advanceTimersByTime(30_000))
    expect(getRegistrationSpy).toHaveBeenCalledTimes(2)
    await flushPromises()

    getRegistrationSpy.mockRestore()
  })

  it('builds payment verifying return path for successful payment redirect', () => {
    expect(`${Path.registrationOk({ eventId: 'test1', id: 'reg1' })}?payment=verifying`).toEqual(
      '/r/test1/reg1/saved?payment=verifying'
    )
  })

  it('shows snackbar when on saved route with payment success and picked', async () => {
    const routes: RouteObject[] = [
      {
        element: <RegistrationListPage />,
        path: '/r/:id/:registrationId/saved',
      },
      {
        element: <>Registration Page</>,
        path: '/r/:id/:registrationId',
      },
    ]

    await renderSuspended(
      <ThemeProvider theme={theme}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={locales.fi}>
          <Provider>
            <Suspense fallback={<div>loading...</div>}>
              <AppSnackbarProvider>
                <DataMemoryRouter
                  initialEntries={['/r/test1/paid-and-picked-nou-registration/saved']}
                  routes={routes}
                />
              </AppSnackbarProvider>
            </Suspense>
          </Provider>
        </LocalizationProvider>
      </ThemeProvider>
    )

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    await flushPromises()

    expect(enqueueSnackbar).toHaveBeenCalledWith('registration.paidAndConfirmed to', {
      style: { overflowWrap: 'break-word', whiteSpace: 'pre-line' },
      variant: 'success',
    })
    expect(screen.getByText('Registration Page')).toBeInTheDocument()
  })

  it('redirects to invitation attachment', async () => {
    await renderWithRouter('/r/testInvited/invitation-attachment-registration/invitation')

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    await flushPromises()

    expect(redirectTo).toHaveBeenCalledWith('/file/attachment-file/koekutsu-20210210-NOU.pdf')
  })

  it('redirects to a class invitation attachment when only that class is invited', async () => {
    const event = {
      ...eventWithParticipantsInvited,
      classes: eventWithParticipantsInvited.classes.map((item) => ({
        ...item,
        state: item.class === 'ALO' ? ('invited' as const) : undefined,
      })),
      state: 'confirmed' as const,
    }
    const registration = {
      ...registrationWithStaticDates,
      class: 'ALO' as const,
      eventId: event.id,
      eventType: event.eventType,
      id: 'class-invitation-registration',
      invitationAttachment: 'alo-attachment',
      payment: paymentPictureWith(),
    }
    vi.spyOn(eventApi, 'getEvent').mockResolvedValueOnce(event)
    vi.spyOn(registrationApi, 'getRegistration').mockResolvedValueOnce(registration)
    vi.spyOn(registrationApi, 'patchRegistration').mockResolvedValueOnce({ ...registration, invitationRead: true })

    await renderWithRouter(`/r/${event.id}/${registration.id}/invitation`)
    await flushPromises()
    await flushPromises()

    expect(redirectTo).toHaveBeenCalledWith(expect.stringContaining('/file/alo-attachment/'))
  })

  it('hides cancel controls when event start is close', async () => {
    vi.setSystemTime(new Date('2021-02-09T00:00:01.000+02:00')) // after cancellation closes
    await renderWithRouter('/r/test1/nou-registration/cancel')

    await flushPromises()
    expect(screen.queryByText('loading...')).not.toBeInTheDocument()

    expect(screen.getByText('registration.cancelDialog.lateText contact, event, registration')).toBeInTheDocument()
    expect(screen.queryByLabelText('registration.cancelDialog.reason')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'registration.cancelDialog.cta' })).not.toBeInTheDocument()
  })
})
