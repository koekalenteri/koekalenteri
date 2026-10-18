import type React from 'react'
import type { ComponentProps } from 'react'
import type { PricedDogEvent, Registration } from '@/types'
import { render, screen } from '@testing-library/react'
import { getPaymentPicture } from '@/lib/payment'
import RegistrationTooltipContent from './RegistrationTooltipContent'

/** The tooltip as RegistrationIcons renders it: with the picture of the row's payment. */
const Tooltip = (props: Omit<ComponentProps<typeof RegistrationTooltipContent>, 'payment'>) => (
  <RegistrationTooltipContent {...props} payment={getPaymentPicture(props.event, props.reg, [])} />
)

vi.mock('@/pages/components/IconsTooltip', () => ({
  TooltipIcon: ({ condition, text, icon }: { condition: boolean; text: string; icon: React.JSX.Element }) =>
    condition ? (
      <div data-testid="tooltip-icon" data-text={text}>
        {icon}
      </div>
    ) : null,
}))

describe('RegistrationTooltipContent', () => {
  // The tooltip reads only a few fields, the fee among them for the payment picture (KOE-1552); the
  // minimal fixtures convert at these boundaries.
  const mockEvent = {
    cost: 40,
    costMember: 40,
    entryStartDate: new Date('2026-01-01'),
    id: 'event-1',
    name: 'Test Event',
    priority: ['member'],
  } as PricedDogEvent

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
  } as unknown as Registration

  it('should render priority tooltip when priority is true', () => {
    render(<Tooltip event={mockEvent} reg={mockRegistration} priority={true} manualResultCount={0} rankingPoints={0} />)

    const priorityTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text')?.startsWith('registration.tooltip.priority '))
    expect(priorityTooltip).toBeInTheDocument()
  })

  it('should render half priority info when priority is 0.5', () => {
    render(<Tooltip event={mockEvent} reg={mockRegistration} priority={0.5} manualResultCount={0} rankingPoints={0} />)

    const priorityTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text') === 'registration.tooltip.priority context, description')
    expect(priorityTooltip).toBeInTheDocument()
  })

  it('should render membership tooltips correctly', () => {
    render(<Tooltip event={mockEvent} reg={mockRegistration} priority={true} manualResultCount={0} rankingPoints={0} />)

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
    render(<Tooltip event={mockEvent} reg={mockRegistration} priority={true} manualResultCount={0} rankingPoints={0} />)

    const paymentTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text') === 'registration.tooltip.paid amount')
    expect(paymentTooltip).toBeInTheDocument()
  })

  // KOE-1529: reads the open refund set, not a stored refundStatus.
  it('should render refund pending tooltip when openRefunds is not empty', () => {
    const regWithPendingRefund = {
      ...mockRegistration,
      openRefunds: ['t1'],
      refundAmount: 2500,
      refundHandlingCost: 5,
    }

    render(
      <Tooltip event={mockEvent} reg={regWithPendingRefund} priority={true} manualResultCount={0} rankingPoints={0} />
    )

    const refundTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text')?.includes('registration.tooltip.refundPending'))
    expect(refundTooltip).toBeInTheDocument()
    expect(refundTooltip).toHaveAttribute('data-text', expect.stringContaining('context'))
    expect(refundTooltip).toHaveAttribute('data-text', expect.stringContaining('handlingCost'))
  })

  it('should render refunded tooltip when refundAt is set', () => {
    const regWithRefund = {
      ...mockRegistration,
      refundAmount: 2500,
      refundAt: new Date(),
      refundHandlingCost: 5,
    }

    render(<Tooltip event={mockEvent} reg={regWithRefund} priority={true} manualResultCount={0} rankingPoints={0} />)

    const refundTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text')?.includes('registration.tooltip.refunded'))
    expect(refundTooltip).toBeInTheDocument()
    expect(refundTooltip).toHaveAttribute('data-text', expect.stringContaining('context'))
    expect(refundTooltip).toHaveAttribute('data-text', expect.stringContaining('handlingCost'))
  })

  it('should render manual results tooltip when manualResultCount > 0', () => {
    render(<Tooltip event={mockEvent} reg={mockRegistration} priority={true} manualResultCount={2} rankingPoints={0} />)

    const manualResultsTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text') === 'registration.tooltip.manualResults')
    expect(manualResultsTooltip).toBeInTheDocument()
  })

  it('should render ranking points tooltip when rankingPoints > 0', () => {
    render(
      <Tooltip event={mockEvent} reg={mockRegistration} priority={true} manualResultCount={0} rankingPoints={10} />
    )

    const rankingPointsTooltip = screen
      .getAllByTestId('tooltip-icon')
      .find((el) => el.getAttribute('data-text') === 'registration.tooltip.rankingPoints points')
    expect(rankingPointsTooltip).toBeInTheDocument()
  })

  it.each([
    [
      { invitationAttachmentSent: 'current', invitationRead: false, messagesSent: { invitation: true } },
      'registration.tooltip.invitation.unread',
    ],
    [
      {
        invitationAttachmentRead: 'current',
        invitationAttachmentSent: 'current',
        messagesSent: { invitation: true },
      },
      'registration.tooltip.invitation.read',
    ],
    [
      {
        invitationAttachmentRead: 'previous',
        invitationAttachmentSent: 'current',
        messagesSent: { invitation: true },
      },
      'registration.tooltip.invitation.read-previous',
    ],
  ])('describes the invitation receipt status', (overrides, expectedText) => {
    render(
      <Tooltip
        event={mockEvent}
        reg={{ ...mockRegistration, ...overrides }}
        priority={false}
        manualResultCount={0}
        rankingPoints={0}
      />
    )

    expect(
      screen.getAllByTestId('tooltip-icon').find((element) => element.getAttribute('data-text') === expectedText)
    ).toBeInTheDocument()
  })

  describe('koekutsu awaiting payment (KOE-1191)', () => {
    // A confirmed trial with a fee, whose ALO class has already been invited.
    const invitedEvent = {
      ...mockEvent,
      classes: [{ class: 'ALO', state: 'invited' }],
      cost: 40,
      entryStartDate: new Date('2026-01-01'),
      state: 'invited',
    } as unknown as PricedDogEvent

    const unpaidParticipant = {
      ...mockRegistration,
      class: 'ALO',
      createdAt: new Date('2026-01-02'),
      dog: { breedCode: '110' },
      eventType: 'NOME-B',
      group: { key: 'ALO-AP', number: 3 },
      messagesSent: { picked: true },
      paidAmount: undefined,
      paidAt: undefined,
      paymentStatus: undefined,
    } as unknown as Registration

    const findText = (text: string) =>
      screen.queryAllByTestId('tooltip-icon').find((element) => element.getAttribute('data-text') === text)

    it('tells that the invitation waits for the fee', () => {
      render(
        <Tooltip
          event={invitedEvent}
          reg={unpaidParticipant}
          priority={false}
          manualResultCount={0}
          rankingPoints={0}
        />
      )

      expect(findText('registration.tooltip.invitation.awaitingPayment')).toBeInTheDocument()
    })

    it('says nothing once the place has been paid for', () => {
      render(
        <Tooltip
          event={invitedEvent}
          reg={{ ...unpaidParticipant, paidAmount: 40, paymentStatus: 'SUCCESS' }}
          priority={false}
          manualResultCount={0}
          rankingPoints={0}
        />
      )

      expect(findText('registration.tooltip.invitation.awaitingPayment')).toBeUndefined()
    })

    it('says nothing for a dog still on the reserve list', () => {
      render(
        <Tooltip
          event={invitedEvent}
          reg={{ ...unpaidParticipant, group: { key: 'reserve', number: 1 } }}
          priority={false}
          manualResultCount={0}
          rankingPoints={0}
        />
      )

      expect(findText('registration.tooltip.invitation.awaitingPayment')).toBeUndefined()
    })

    it('says nothing before the class has been invited', () => {
      render(
        <Tooltip
          event={{ ...invitedEvent, classes: [{ class: 'ALO', state: 'picked' }], state: 'picked' } as PricedDogEvent}
          reg={unpaidParticipant}
          priority={false}
          manualResultCount={0}
          rankingPoints={0}
        />
      )

      expect(findText('registration.tooltip.invitation.awaitingPayment')).toBeUndefined()
    })
  })

  it('describes the acknowledgement as the latest when multiple invitations have been sent', () => {
    render(
      <Tooltip
        event={{
          ...mockEvent,
          invitationAttachmentHistory: {
            current: { uploadedAt: new Date() },
            previous: { uploadedAt: new Date() },
          },
        }}
        reg={{
          ...mockRegistration,
          invitationAttachmentRead: 'current',
          invitationAttachmentSent: 'current',
          messagesSent: { invitation: true },
        }}
        priority={false}
        manualResultCount={0}
        rankingPoints={0}
      />
    )

    expect(
      screen
        .getAllByTestId('tooltip-icon')
        .find((element) => element.getAttribute('data-text') === 'registration.tooltip.invitation.read-latest')
    ).toBeInTheDocument()
  })

  describe('fee against what was paid', () => {
    // The test t() spells the key and its option names out, so a line is known by its key alone.
    const tooltipKeys = () =>
      screen.getAllByTestId('tooltip-icon').map((element) => element.getAttribute('data-text')?.split(' ')[0])
    // The secretary's trial carries the fee; the member price is lower than the full price.
    const pricedEvent = {
      ...mockEvent,
      cost: 40,
      costMember: 35,
      entryStartDate: new Date('2026-01-01'),
      state: 'confirmed',
    } as PricedDogEvent
    const paid = (paidAmount: number, membership: boolean) =>
      ({
        ...mockRegistration,
        handler: { membership, name: 'Test Handler' },
        owner: { membership, name: 'Test Owner' },
        ownerHandles: false,
        paidAmount,
        paidAt: new Date('2026-01-02'),
      }) as unknown as Registration

    it('names the missing part when a member price was paid by a non-member (KOE-722)', () => {
      render(
        <Tooltip event={pricedEvent} reg={paid(35, false)} priority={false} manualResultCount={0} rankingPoints={0} />
      )
      expect(tooltipKeys()).toContain('registration.tooltip.paymentDue')
      expect(tooltipKeys()).not.toContain('registration.tooltip.paymentExcess')
    })

    it('names the overpaid part when the full price was paid by a member (KOE-1382)', () => {
      render(
        <Tooltip event={pricedEvent} reg={paid(40, true)} priority={false} manualResultCount={0} rankingPoints={0} />
      )
      expect(tooltipKeys()).toContain('registration.tooltip.paymentExcess')
      expect(tooltipKeys()).not.toContain('registration.tooltip.paymentDue')
    })

    it('says nothing of the balance when the fee was paid as it reads', () => {
      render(
        <Tooltip event={pricedEvent} reg={paid(35, true)} priority={false} manualResultCount={0} rankingPoints={0} />
      )
      expect(tooltipKeys()).not.toContain('registration.tooltip.paymentDue')
      expect(tooltipKeys()).not.toContain('registration.tooltip.paymentExcess')
    })

    // KOE-1526 review: refunded as a reserve, lifted into a place and paid again: paid, and settled.
    it('says a refunded fee paid again is paid, with nothing missing', () => {
      render(
        <Tooltip
          event={pricedEvent}
          reg={{
            ...paid(80, false),
            group: { key: '2026-08-15-ap', number: 1 },
            refundAmount: 40,
            refundAt: new Date('2026-01-10'),
            refundHandlingCost: 0,
            refundStatus: 'SUCCESS',
          }}
          priority={false}
          manualResultCount={0}
          rankingPoints={0}
        />
      )
      expect(tooltipKeys()).toContain('registration.tooltip.paid')
      expect(tooltipKeys()).toContain('registration.tooltip.refunded')
      expect(tooltipKeys()).not.toContain('registration.tooltip.paymentDue')
    })

    // The report of KOE-1526: reserve #1 had its whole fee back and read as owing it again.
    it('says the fee was refunded, and nothing of a missing part, for a reserve whose fee went back', () => {
      render(
        <Tooltip
          event={pricedEvent}
          reg={{
            ...paid(40, false),
            group: { key: 'reserve', number: 1 },
            refundAmount: 40,
            refundAt: new Date('2026-01-10'),
            refundHandlingCost: 0,
            refundStatus: 'SUCCESS',
          }}
          priority={false}
          manualResultCount={0}
          rankingPoints={0}
        />
      )
      expect(tooltipKeys()).toContain('registration.tooltip.refunded')
      expect(tooltipKeys()).not.toContain('registration.tooltip.paymentDue')
    })
  })
})
