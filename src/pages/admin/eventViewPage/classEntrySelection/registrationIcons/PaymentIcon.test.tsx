import type { ComponentProps } from 'react'
import type { ConfirmedEvent, Registration } from '@/types'
import { render, screen } from '@testing-library/react'
import { withRowPaymentPicture } from '@/__mockData__/paymentPicture'
import { registrationWithStaticDates } from '@/__mockData__/registrations'
import { eventWithStations } from '@/__mockData__/resultsEvent'
import PaymentIconBase from './PaymentIcon'

// The fee is 40 for a non-member, as in RegistrationIcons.visual.test.tsx.
const event: ConfirmedEvent = { ...eventWithStations, cost: 40, costMember: 35 }

/** The icon as RegistrationIcons renders it: with the picture of the row's payment. */
const PaymentIcon = withRowPaymentPicture<Omit<ComponentProps<typeof PaymentIconBase>, 'payment'>>(PaymentIconBase)

const paid = (paidAmount: number, overrides: Partial<Registration> = {}): Registration => ({
  ...registrationWithStaticDates,
  eventId: event.id,
  eventType: event.eventType,
  id: `paid-${paidAmount}`,
  paidAmount,
  ...overrides,
})

describe('PaymentIcon', () => {
  it('should render SavingsOutlined icon when the payment went back', () => {
    const reg = paid(50, { refundAmount: 50, refundAt: new Date() })

    render(<PaymentIcon event={event} reg={reg} />)

    // SavingsOutlined icon has this path
    expect(screen.getByTestId('SavingsOutlinedIcon')).toBeInTheDocument()
  })

  // KOE-1526 review: a reserve refunded and then lifted into a place that paid again is paid.
  // Net paid (90 - 50) matches the 40 fee exactly, so this is paid, not overpaid (KOE-1104).
  it('should render EuroOutlined icon when a refunded fee has been paid again', () => {
    const reg = paid(90, { refundAmount: 50, refundAt: new Date() })

    render(<PaymentIcon event={event} reg={reg} />)

    expect(screen.getByTestId('EuroOutlinedIcon')).toBeInTheDocument()
  })

  // KOE-1529: reads the open refund set, not a stored refundStatus.
  it('should render SavingsOutlined icon when openRefunds is not empty', () => {
    const reg = paid(40, { openRefunds: ['t1'] })

    render(<PaymentIcon event={event} reg={reg} />)

    expect(screen.getByTestId('SavingsOutlinedIcon')).toBeInTheDocument()
  })

  it('should render EuroOutlined icon with full opacity when paidAt is set', () => {
    const reg = paid(40)

    render(<PaymentIcon event={event} reg={reg} />)

    const icon = screen.getByTestId('EuroOutlinedIcon')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveStyle('opacity: 1')
  })

  it('should render EuroOutlined icon with low opacity when paidAt is not set', () => {
    const reg = paid(40, { paidAt: undefined })

    render(<PaymentIcon event={event} reg={reg} />)

    const icon = screen.getByTestId('EuroOutlinedIcon')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveStyle('opacity: 0.05')
  })

  // KOE-1104: a missing part is still what the secretary collects, the amber euro sign, not the
  // overpaid mark.
  it('should render the amber EuroOutlined icon when a part of the fee is missing', () => {
    const reg = paid(35) // owes 5 of the 40 fee

    render(<PaymentIcon event={event} reg={reg} />)

    expect(screen.queryByTestId('ProductionQuantityLimitsIcon')).not.toBeInTheDocument()
    const icon = screen.getByTestId('EuroOutlinedIcon')
    expect(icon).toBeInTheDocument()
  })

  // KOE-1104: the money is overpaid and can still be refunded, so it gets its own mark instead of
  // the amber euro sign. The condition is money, not group: an overpaid reserve shows it too.
  it.each([
    ['a participant', { group: { key: '2021-02-10-ap', number: 1 } }],
    ['a reserve', {}],
  ])('should render the overpaid mark for %s who paid too much', (_label, override) => {
    const reg = paid(45, override) // 5 over the 40 fee

    render(<PaymentIcon event={event} reg={reg} />)

    expect(screen.queryByTestId('EuroOutlinedIcon')).not.toBeInTheDocument()
    expect(screen.getByTestId('ProductionQuantityLimitsIcon')).toBeInTheDocument()
    // react-i18next is mocked to echo the key back in this project (src/__mocks__/react-i18next).
    expect(screen.getByRole('img', { name: 'registration.paidExcess' })).toBeInTheDocument()
  })

  // KOE-1552: only a confirmed trial carries the fee the marks compare against; in a cancelled one
  // an overpaid or part paid fee shows the plain euro sign, though the excess can still be returned.
  it.each([
    ['paid over', 45],
    ['part paid', 35],
  ])('should render the plain EuroOutlined icon for a fee %s in a cancelled trial', (_label, paidAmount) => {
    render(<PaymentIcon event={{ ...event, state: 'cancelled' }} reg={paid(paidAmount)} />)

    expect(screen.queryByTestId('ProductionQuantityLimitsIcon')).not.toBeInTheDocument()
    const icon = screen.getByTestId('EuroOutlinedIcon')
    expect(icon).not.toHaveClass('MuiSvgIcon-colorWarning')
    expect(icon).toHaveStyle('opacity: 1')
  })
})
