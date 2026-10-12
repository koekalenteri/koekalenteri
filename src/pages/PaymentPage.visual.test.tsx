import type { CreatePaymentResponse, Language, PublicConfirmedEvent } from '../types'
import { ThemeProvider } from '@mui/material/styles'
import { Provider } from 'jotai'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '../__mockData__/events'
import { unpaidRegistrationWithStaticDatesAndClass } from '../__mockData__/registrations'
import theme from '../assets/Theme'
// The "Takaisin" link's black/bold/underlined look is a global class, not a theme override.
import '../index.css'
import { describeInLanguage } from '../test-utils/language'
import { PaymentPageWithData } from './PaymentPage'

const PHONE = { height: 900, width: 390 }
const DESKTOP = { height: 900, width: 800 }

/** A 1x1 transparent square: the grid layout is what's under test, not Paytrail's real logos. */
const ICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='24'%3E%3Crect width='40' height='24' rx='3' fill='%23ccc'/%3E%3C/svg%3E"

const provider = (id: string, group: string, name: string) => ({
  group,
  icon: ICON,
  id,
  name,
  parameters: [],
  svg: ICON,
  url: `https://example.test/pay/${id}`,
})

const response: CreatePaymentResponse = {
  customProviders: {},
  groups: [
    { icon: ICON, id: 'bank', name: 'Pankkimaksutavat', svg: ICON },
    { icon: ICON, id: 'creditcard', name: 'Korttimaksutavat', svg: ICON },
  ],
  href: 'https://example.test/pay',
  providers: [
    provider('op', 'bank', 'OP'),
    provider('nordea', 'bank', 'Nordea'),
    provider('danske', 'bank', 'Danske Bank'),
    provider('spankki', 'bank', 'S-Pankki'),
    provider('visa', 'creditcard', 'Visa'),
    provider('mastercard', 'creditcard', 'Mastercard'),
  ],
  reference: 'ref-1',
  terms: 'Siirryt maksamaan palveluun <a href="https://www.paytrail.com">Paytrail Oyj</a>',
  transactionId: 'transaction-1',
}

const event = {
  ...eventWithStaticDates,
  cost: 50,
  paymentTime: 'registration' as const,
}

const registration = {
  ...unpaidRegistrationWithStaticDatesAndClass,
  totalAmount: 50,
}

/**
 * The page at a screen's width. The payer sees the page in the language they entered in -- the page
 * switches to the registration's language itself -- so that is where the language goes.
 */
const renderAt = async (
  { height, width }: { height: number; width: number },
  language: Language = 'fi',
  responseStatus?: number,
  paytrailError?: string
) => {
  await page.viewport(width, height)

  return render(
    <ThemeProvider theme={theme}>
      <div data-testid="visual-root" style={{ background: '#fff', width }}>
        <Provider>
          <MemoryRouter>
            <PaymentPageWithData
              registrationId={registration.id}
              event={event as PublicConfirmedEvent}
              registration={{ ...registration, language }}
              response={responseStatus ? undefined : response}
              responseStatus={responseStatus}
              paytrailError={paytrailError}
            />
          </MemoryRouter>
        </Provider>
      </div>
    </ThemeProvider>
  )
}

// Every render opens the page as from an email link in a fresh tab: the tab's decision about the
// registration's language (KOE-1512) would otherwise carry over to the next test of the same id.
beforeEach(() => sessionStorage.clear())

it('lays out the payment method groups on a desktop', async () => {
  const screen = await renderAt(DESKTOP)

  await expect.element(screen.getByRole('img', { name: 'Mastercard' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payment-page-methods-desktop')
})

it('wraps the payment method groups on a phone', async () => {
  const screen = await renderAt(PHONE)

  await expect.element(screen.getByRole('img', { name: 'Mastercard' })).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payment-page-methods-phone')
})

// A notice in place of the methods: the sentence keeps its size, and the page's title above it is for
// a screen reader only, so the notice is not announced as the page's name (KOE-1506).
it('tells the payer the registration is already paid', async () => {
  const screen = await renderAt(DESKTOP, 'fi', 204)

  await expect.element(screen.getByText('Ilmoittautuminen on jo maksettu')).toBeVisible()
  await expect.element(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ilmoittautumisen maksu')
  expect(screen.getByRole('heading', { name: 'Ilmoittautuminen on jo maksettu' }).query()).toBeNull()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payment-page-already-paid')
})

/** Paytrail's own JSON answer to a payment it would not create. */
const PAYTRAIL_REFUSAL = JSON.stringify({ message: 'Validation failed', status: 'error' })

// Paytrail's refusal, with its status and words, in the payer's language (KOE-1513).
it('tells the payer Paytrail refused the payment', async () => {
  const screen = await renderAt(DESKTOP, 'fi', 400, PAYTRAIL_REFUSAL)

  const notice = 'Maksun luonti epäonnistui Paytrailissa (400): Validation failed'
  await expect.element(screen.getByText(notice)).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payment-page-paytrail-refusal')
})

// The guide's English page shows the page in English (KOE-1437).
describeInLanguage('en', () => {
  it('tells the payer Paytrail refused the payment', async () => {
    const screen = await renderAt(DESKTOP, 'en', 400, PAYTRAIL_REFUSAL)

    const notice = 'Payment could not be created at Paytrail (400): Validation failed'
    await expect.element(screen.getByText(notice)).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payment-page-paytrail-refusal-en')
  })

  it('lays out the payment method groups on a desktop', async () => {
    const screen = await renderAt(DESKTOP, 'en')

    await expect.element(screen.getByText('Choose payment method')).toBeVisible()
    await expect.element(screen.getByRole('img', { name: 'Mastercard' })).toBeVisible()
    await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payment-page-methods-desktop-en')
  })
})
