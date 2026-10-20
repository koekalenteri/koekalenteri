import type { MinimalEventForCost, MinimalRegistrationForCost, PublicDogEvent } from '../../types'
import { render, screen } from '@testing-library/react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { eventWithStaticDates } from '../../__mockData__/events'
import { paymentPictureWith } from '../../__mockData__/paymentPicture'
import { languageAtom } from '../state'
import { PaymentDetails } from './PaymentDetails'

/** A confirmed trial: the details show what is to pay only for one (KOE-1526). */
const event: PublicDogEvent & MinimalEventForCost = {
  ...eventWithStaticDates,
  cost: {
    earlyBird: { cost: 35, days: 7 },
    normal: 45,
    optionalAdditionalCosts: [
      { cost: 15, description: { en: 'Saturday accommodation', fi: 'Majoitus lauantaina' } },
      { cost: 10, description: { en: 'Evening meal', fi: 'Iltaruokailu' } },
    ],
  },
  costMember: { earlyBird: { cost: 30, days: 7 }, normal: 40 },
  entryStartDate: '2025-08-01',
}

/** Registered on the first entry day, so the early bird price is the one that applies. */
const registration: MinimalRegistrationForCost = {
  createdAt: new Date('2025-08-02T09:00:00Z'),
  dog: { breedCode: '122' },
  optionalCosts: [1],
  owner: { membership: false },
  ownerHandles: true,
}

describe('PaymentDetails', () => {
  const setup = (props: Partial<Parameters<typeof PaymentDetails>[0]> = {}, language: 'en' | 'fi' = 'fi') =>
    render(<PaymentDetails event={event} registration={registration} {...props} />, {
      wrapper: ({ children }) => (
        <Provider initializeState={({ set }) => set(languageAtom, language)}>{children}</Provider>
      ),
    })

  it('names the applicable cost and the optional services chosen in it', () => {
    setup()

    expect(screen.getByText(/^costNames\.earlyBird/)).toBeInTheDocument()
    expect(screen.getByText('35,00 €')).toBeInTheDocument()
    expect(screen.getByText('Iltaruokailu')).toBeInTheDocument()
    expect(screen.getByText('10,00 €')).toBeInTheDocument()
    // Not chosen, so not bought
    expect(screen.queryByText('Majoitus lauantaina')).not.toBeInTheDocument()
  })

  it("names an optional service in the reader's language", () => {
    setup({}, 'en')

    expect(screen.getByText('Evening meal')).toBeInTheDocument()
  })

  it('totals the registration on request', () => {
    setup({ includeTotal: true })

    expect(screen.getByText('costTotal')).toBeInTheDocument()
    expect(screen.getByText('45,00 €')).toBeInTheDocument()
  })

  it('leaves the total out unless asked for', () => {
    setup()

    expect(screen.queryByText('costTotal')).not.toBeInTheDocument()
  })

  it('shows what has been paid and what is still payable', () => {
    setup({ includePayable: true, includeTotal: true, registration: { ...registration, paidAmount: 30 } })

    expect(screen.getByText('registration.paid')).toBeInTheDocument()
    expect(screen.getByText('30,00 €')).toBeInTheDocument()
    expect(screen.getByText('registration.toBePaid')).toBeInTheDocument()
    expect(screen.getByText('15,00 €')).toBeInTheDocument()
  })

  it('takes a refund off what was paid (KOE-1460)', () => {
    // 45 € paid for a 35 € fee, the 10 € paid over has been returned: nothing is owed or owing.
    setup({
      includePayable: true,
      includeTotal: true,
      registration: { ...registration, optionalCosts: [], paidAmount: 45, refundAmount: 10 },
    })

    expect(screen.getByText('registration.paid')).toBeInTheDocument()
    expect(screen.getByText('45,00 €')).toBeInTheDocument()
    expect(screen.getByText('registration.refunded')).toBeInTheDocument()
    expect(screen.getByText('−10,00 €')).toBeInTheDocument()
    expect(screen.getByText('registration.toBePaid').nextSibling).toHaveTextContent('0,00 €')
  })

  // KOE-1526: the participant's page has no group, so the server's due says whether a refunded
  // reserve owes the fee again.
  it.each([
    ['nothing while the reserve has no place', 0, '0,00 €'],
    ['the fee again once the reserve has a place', 35, '35,00 €'],
  ])('asks a reserve whose fee was refunded for %s (KOE-1526)', (_name, paymentDue, payable) => {
    setup({
      includePayable: true,
      registration: {
        ...registration,
        optionalCosts: [],
        paidAmount: 35,
        payment: paymentPictureWith({
          due: paymentDue,
          paidAmount: 35,
          refundedAmount: 35,
          standing: false,
          status: paymentDue > 0 ? 'unpaid' : 'refunded',
        }),
        refundAmount: 35,
      },
    })

    expect(screen.getByText('registration.toBePaid').nextSibling).toHaveTextContent(payable)
  })

  // KOE-1526: the kept handling fee is the price of the refund, so it has its own line and the
  // rows add up to what is left to pay.
  it('shows the handling fee kept from a refund on its own line', () => {
    setup({
      includePayable: true,
      registration: {
        ...registration,
        optionalCosts: [],
        paidAmount: 35,
        payment: paymentPictureWith({
          due: 35,
          keptFee: 5,
          paidAmount: 35,
          refundedAmount: 30,
          standing: false,
          status: 'unpaid',
        }),
        refundAmount: 30,
        refundHandlingCost: 5,
      },
    })

    expect(screen.getByText('registration.refundHandlingCost').nextSibling).toHaveTextContent('−5,00 €')
    expect(screen.getByText('registration.toBePaid').nextSibling).toHaveTextContent('35,00 €')
  })

  // KOE-1552: the secretary's row carries no picture but has its group, so the details work the
  // picture out from the row: a refunded fee is owed again by a place, not by a reserve.
  it.each([
    ['a place', { key: '2025-08-15-ap', number: 1 }, '35,00 €'],
    ['a reserve', { key: 'reserve', number: 1 }, '0,00 €'],
  ])("reads the secretary's row of %s whose fee was refunded", (_name, group, payable) => {
    setup({
      includePayable: true,
      registration: {
        ...registration,
        group,
        optionalCosts: [],
        paidAmount: 35,
        paymentStatus: 'SUCCESS',
        refundAmount: 30,
        refundHandlingCost: 5,
      },
    })

    expect(screen.getByText('registration.paid').nextSibling).toHaveTextContent('35,00 €')
    expect(screen.getByText('registration.refunded').nextSibling).toHaveTextContent('−30,00 €')
    expect(screen.getByText('registration.refundHandlingCost').nextSibling).toHaveTextContent('−5,00 €')
    expect(screen.getByText('registration.toBePaid').nextSibling).toHaveTextContent(payable)
  })

  // KOE-1530: with the server's picture the details show its amounts, whatever the row beside it
  // holds; a row without one (the form's, the secretary's) is read as before.
  it("shows the picture's amounts and what is to pay in place of the row's own", () => {
    setup({
      includePayable: true,
      registration: {
        ...registration,
        optionalCosts: [],
        paidAmount: 10,
        payment: paymentPictureWith({
          due: 12,
          keptFee: 3,
          paidAmount: 45,
          refundedAmount: 20,
          standing: true,
          status: 'partial',
        }),
        refundAmount: 1,
        refundHandlingCost: 1,
      },
    })

    expect(screen.getByText('registration.paid').nextSibling).toHaveTextContent('45,00 €')
    expect(screen.getByText('registration.refunded').nextSibling).toHaveTextContent('−20,00 €')
    expect(screen.getByText('registration.refundHandlingCost').nextSibling).toHaveTextContent('−3,00 €')
    expect(screen.getByText('registration.toBePaid').nextSibling).toHaveTextContent('12,00 €')
  })

  // KOE-1526 review: the details ask for what the status box asks for, and a trial that is not
  // confirmed, a cancelled one say, asks for nothing.
  it('asks nothing to be paid for a trial that is not confirmed', () => {
    setup({
      event: { ...event, state: 'cancelled' },
      includePayable: true,
      registration: { ...registration, optionalCosts: [] },
    })

    expect(screen.getByText('registration.toBePaid').nextSibling).toHaveTextContent('0,00 €')
  })

  it('says nothing about payments that have not been made', () => {
    setup()

    expect(screen.queryByText('registration.paid')).not.toBeInTheDocument()
    expect(screen.queryByText('registration.toBePaid')).not.toBeInTheDocument()
  })

  it('marks the fee as a member price only when the member pays less', () => {
    const member = { ...registration, owner: { membership: true } }
    setup({ registration: member })

    expect(screen.getByText(/^costNames\.earlyBird.*costForMembers$/)).toBeInTheDocument()
    expect(screen.getByText('30,00 €')).toBeInTheDocument()
    // The service has no member price of its own; saying "for members" of it would be a claim about
    // a discount that does not exist.
    expect(screen.getByText('Iltaruokailu')).toBeInTheDocument()
  })

  it('renders a legacy flat cost as the one thing that was bought', () => {
    setup({ event: { ...event, cost: 50, costMember: undefined }, includeTotal: true })

    expect(screen.getByText(/^costNames\.normal/)).toBeInTheDocument()
    expect(screen.getAllByText('50,00 €')).toHaveLength(2)
  })
})
