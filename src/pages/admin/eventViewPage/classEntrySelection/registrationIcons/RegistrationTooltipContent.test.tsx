import { render, screen } from '@testing-library/react'
import * as registrationUtils from '../../../../../lib/registration'
import RegistrationTooltipContent from './RegistrationTooltipContent'

jest.mock('../../../../components/IconsTooltip', () => ({
  TooltipIcon: ({ condition, text, icon }: { condition: boolean; text: string; icon: JSX.Element }) =>
    condition ? (
      <div data-testid="tooltip-icon" data-text={text}>
        {icon}
      </div>
    ) : null,
}))

describe('RegistrationTooltipContent', () => {
  const mockEvent = {
    id: 'event-1',
    name: 'Test Event',
  } as any

  const mockRegistration = {
    confirmed: true,
    handler: { membership: true, name: 'Test Handler' },
    id: 'reg-1',
    internalNotes: 'Internal notes',
    invitationRead: true,
    notes: 'Some notes',
    owner: { membership: false, name: 'Test Owner' },
    paidAmount: 5000,
    paidAt: new Date(),
    refundAmount: 0,
    refundAt: undefined,
    refundStatus: undefined,
  } as any

  beforeEach(() => {
    jest.spyOn(registrationUtils, 'priorityDescriptionKey').mockReturnValue('member')
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('should render priority tooltip when priority is true', () => {
    render(
      <RegistrationTooltipContent
        event={mockEvent}
        reg={mockRegistration}
        priority={true}
        manualResultCount={0}
        rankingPoints={0}
      />
    )

    const priorityTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text')?.includes('Ilmoittautuja on etusijalla'))
    expect(priorityTooltip).toBeInTheDocument()
  })

  it('should render half priority info when priority is 0.5', () => {
    render(
      <RegistrationTooltipContent
        event={mockEvent}
        reg={mockRegistration}
        priority={0.5}
        manualResultCount={0}
        rankingPoints={0}
      />
    )

    const priorityTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text')?.includes('(vain ohjaaja on jäsen)'))
    expect(priorityTooltip).toBeInTheDocument()
  })

  it('should render membership tooltips correctly', () => {
    render(
      <RegistrationTooltipContent
        event={mockEvent}
        reg={mockRegistration}
        priority={true}
        manualResultCount={0}
        rankingPoints={0}
      />
    )

    const handlerMembershipTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text') === 'registration.handlerIsMember')
    expect(handlerMembershipTooltip).toBeInTheDocument()

    // Owner is not a member in our mock
    const ownerMembershipTooltip = screen
      .queryAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text') === 'registration.ownerIsMember')
    expect(ownerMembershipTooltip).toBeUndefined()
  })

  it('should render payment tooltip when paid', () => {
    render(
      <RegistrationTooltipContent
        event={mockEvent}
        reg={mockRegistration}
        priority={true}
        manualResultCount={0}
        rankingPoints={0}
      />
    )

    const paymentTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text')?.includes('Ilmoittautuja on maksanut'))
    expect(paymentTooltip).toBeInTheDocument()
  })

  it('should render refund pending tooltip when refundStatus is PENDING', () => {
    const regWithPendingRefund = {
      ...mockRegistration,
      refundAmount: 2500,
      refundStatus: 'PENDING' as const,
    }

    render(
      <RegistrationTooltipContent
        event={mockEvent}
        reg={regWithPendingRefund}
        priority={true}
        manualResultCount={0}
        rankingPoints={0}
      />
    )

    const refundTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text')?.includes('Palautuksen käsittely on kesken'))
    expect(refundTooltip).toBeInTheDocument()
  })

  it('should render refunded tooltip when refundAt is set', () => {
    const regWithRefund = {
      ...mockRegistration,
      refundAmount: 2500,
      refundAt: new Date(),
    }

    render(
      <RegistrationTooltipContent
        event={mockEvent}
        reg={regWithRefund}
        priority={true}
        manualResultCount={0}
        rankingPoints={0}
      />
    )

    const refundTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text')?.includes('Ilmoittautumismaksua on palautettu'))
    expect(refundTooltip).toBeInTheDocument()
  })

  it('should render manual results tooltip when manualResultCount > 0', () => {
    render(
      <RegistrationTooltipContent
        event={mockEvent}
        reg={mockRegistration}
        priority={true}
        manualResultCount={2}
        rankingPoints={0}
      />
    )

    const manualResultsTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text') === 'Ilmoittautuja on lisännyt koetuloksia')
    expect(manualResultsTooltip).toBeInTheDocument()
  })

  it('should render ranking points tooltip when rankingPoints > 0', () => {
    render(
      <RegistrationTooltipContent
        event={mockEvent}
        reg={mockRegistration}
        priority={true}
        manualResultCount={0}
        rankingPoints={10}
      />
    )

    const rankingPointsTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text') === 'Karsintapisteet: 10')
    expect(rankingPointsTooltip).toBeInTheDocument()
  })
})
