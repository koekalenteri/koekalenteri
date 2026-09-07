import type { CreatePaymentResponse, PublicConfirmedEvent } from '../types'
import { Provider } from 'jotai'
import { MemoryRouter } from 'react-router'
import { page } from 'vitest/browser'
import { render } from 'vitest-browser-react'
import { eventWithStaticDates } from '../__mockData__/events'
import { unpaidRegistrationWithStaticDatesAndClass } from '../__mockData__/registrations'
// The "Takaisin" link's black/bold/underlined look is a global class, not a theme override.
import '../index.css'
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

const renderAt = async ({ height, width }: { height: number; width: number }) => {
  await page.viewport(width, height)

  return render(
    <div data-testid="visual-root" style={{ background: '#fff', width }}>
      <Provider>
        <MemoryRouter>
          <PaymentPageWithData
            registrationId={registration.id}
            event={event as PublicConfirmedEvent}
            registration={registration}
            response={response}
          />
        </MemoryRouter>
      </Provider>
    </div>
  )
}

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
