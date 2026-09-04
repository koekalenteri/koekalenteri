import type { MinimalEventForCost, MinimalRegistrationForCost } from '../../types'
import { ThemeProvider } from '@mui/material/styles'
import { render } from 'vitest-browser-react'
import theme from '../../assets/Theme'
import { TestProvider } from '../../test-utils/AtomProvider'
import { PaymentDetails } from './PaymentDetails'

/** Wrapper the screenshot is taken of: a fixed width and an opaque background keep captures stable. */
const Frame = ({ children, width = 600 }: { readonly children: React.ReactNode; readonly width?: number }) => (
  <div data-testid="visual-root" style={{ background: '#fff', padding: 16, width }}>
    <ThemeProvider theme={theme}>{children}</ThemeProvider>
  </div>
)

/** A phone's worth of width, less the page's own margins. */
const PHONE = 360

const event: MinimalEventForCost = {
  cost: {
    earlyBird: { cost: 35, days: 7 },
    normal: 45,
    optionalAdditionalCosts: [
      { cost: 15, description: { en: 'Saturday accommodation', fi: 'Majoitus lauantaina' } },
      { cost: 10, description: { en: 'Evening meal', fi: 'Iltaruokailu' } },
    ],
  },
  costMember: {
    earlyBird: { cost: 30, days: 7 },
    normal: 40,
  },
  entryStartDate: new Date('2025-08-01T00:00:00Z'),
}

/** Registered on the first entry day, so the early bird price is the one that applies. */
const registration: MinimalRegistrationForCost = {
  createdAt: new Date('2025-08-02T09:00:00Z'),
  dog: { breedCode: '122' },
  optionalCosts: [0, 1],
  owner: { membership: true },
  ownerHandles: true,
  selectedCost: 'earlyBird',
}

it('itemizes what the registration bought and at what price', async () => {
  // KOE-1055: the event's price list says nothing about which of it this registrant chose.
  const screen = await render(
    <TestProvider>
      <Frame>
        <PaymentDetails event={event} registration={registration} includeTotal />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByText('Summa yhteensä')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payment-details-itemized')
})

it('shows what is still payable after a partial payment', async () => {
  const screen = await render(
    <TestProvider>
      <Frame width={PHONE}>
        <PaymentDetails event={event} registration={{ ...registration, paidAmount: 30 }} includeTotal includePayable />
      </Frame>
    </TestProvider>
  )

  await expect.element(screen.getByText('Maksettava')).toBeVisible()
  await expect(screen.getByTestId('visual-root')).toMatchScreenshot('payment-details-payable-phone')
})
