import type { MinimalEventForCost, MinimalRegistrationForCost } from '../../types'
import { render, screen } from '@testing-library/react'
import { TestProvider as Provider } from 'test-utils/AtomProvider'
import { languageAtom } from '../state'
import { PaymentDetails } from './PaymentDetails'

const event: MinimalEventForCost = {
  cost: {
    earlyBird: { cost: 35, days: 7 },
    normal: 45,
    optionalAdditionalCosts: [
      { cost: 15, description: { en: 'Saturday accommodation', fi: 'Majoitus lauantaina' } },
      { cost: 10, description: { en: 'Evening meal', fi: 'Iltaruokailu' } },
    ],
  },
  costMember: { earlyBird: { cost: 30, days: 7 }, normal: 40 },
  entryStartDate: new Date('2025-08-01T00:00:00Z'),
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
    setup({ event: { cost: 50, costMember: undefined, entryStartDate: event.entryStartDate }, includeTotal: true })

    expect(screen.getByText(/^costNames\.normal/)).toBeInTheDocument()
    expect(screen.getAllByText('50,00 €')).toHaveLength(2)
  })
})
