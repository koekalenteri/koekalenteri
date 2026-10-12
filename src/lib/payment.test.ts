import type { MinimalEventForCost, MinimalRegistrationForCost, PaymentStatus, Registration } from '../types'
import { addDays } from 'date-fns'
import { eventWithStaticDates } from '../__mockData__/events'
import {
  canRefundExcess,
  getParticipantPaymentDue,
  getParticipantPaymentState,
  getPaymentStatus,
  getProviderName,
  getRegistrationPaymentDetails,
  getShownPaymentDue,
  isInvitationAwaitingPayment,
  isPaidStatus,
  isPaymentOffered,
  isPaymentUnsettled,
  isPaytrailRefusal,
  isRegistrationPaid,
  PROVIDER_NAMES,
  paytrailErrorMessage,
  paytrailErrorText,
  paytrailRefusalBody,
  shouldParticipantPay,
  shouldSendInvitationAfterPayment,
  transactionActor,
} from './payment'

describe('payment', () => {
  // KOE-1526: the participant's pages have no group, so the server says what a returned fee owes.
  describe('the participant payment state', () => {
    const event: MinimalEventForCost = { cost: 40, costMember: 35, entryStartDate: new Date('2026-01-01') }
    const member = {
      createdAt: new Date('2026-01-02'),
      dog: { breedCode: '110' as const },
      owner: { membership: true },
      ownerHandles: true,
    }

    describe('getParticipantPaymentDue', () => {
      it('reads a paid place as the form has it, so a change shows at once (KOE-722)', () => {
        const paid = { ...member, paidAmount: 35, paymentDue: 0 }
        expect(getParticipantPaymentDue(event, { ...paid, owner: { membership: false } })).toBe(5)
      })

      it.each([
        ['nothing while it is a reserve', 0],
        ['the fee again once it has a place', 35],
      ])("takes the server's word for a fee that went back: %s", (_name, paymentDue) => {
        expect(getParticipantPaymentDue(event, { ...member, paidAmount: 35, paymentDue, refundAmount: 35 })).toBe(
          paymentDue
        )
      })

      // The server's due says only whether the entry holds a place; the amount is the form's own, so
      // a change to a lifted reserve's entry shows at once (KOE-1526 review).
      it('reads the amount of a lifted reserve whose fee went back as the form has it', () => {
        const lifted = { ...member, paidAmount: 35, paymentDue: 35, refundAmount: 35 }
        expect(getParticipantPaymentDue(event, { ...lifted, owner: { membership: false } })).toBe(40)
      })

      it('reads a returned fee itself when a response came without the due', () => {
        expect(getParticipantPaymentDue(event, { ...member, paidAmount: 35, refundAmount: 35 })).toBe(0)
      })
    })

    describe('shouldParticipantPay', () => {
      const place = { key: '2026-08-15-ap' }
      it.each<[string, Parameters<typeof shouldParticipantPay>[1], number, 'registration' | 'confirmation', boolean]>([
        ['an unpaid entry', {}, 40, 'registration', true],
        ['a paid entry', { paymentStatus: 'SUCCESS' }, 0, 'registration', false],
        ['a paid entry still owing a part', { paymentStatus: 'SUCCESS' }, 5, 'registration', true],
        // What the last attempt left does not matter: the balance decides (KOE-1526 review).
        ['a returned fee whose next payment was cancelled', { paymentStatus: 'CANCEL' }, 0, 'registration', false],
        ['a returned fee whose next payment was never made', { paymentStatus: 'NEW' }, 0, 'registration', false],
        ['an entry to a trial that costs nothing', {}, 0, 'registration', false],
        ['a paid place paying at confirmation', { group: place, paymentStatus: 'SUCCESS' }, 0, 'confirmation', false],
        ['a payment in progress', { paymentStatus: 'PENDING' }, 40, 'registration', false],
        ['a cancelled entry', { cancelled: true }, 40, 'registration', false],
        ['a payment charged twice', { paymentStatus: 'DUPLICATE' }, 40, 'registration', false],
        ['a reserve paying at confirmation', { group: { key: 'reserve' } }, 40, 'confirmation', false],
        ['a place paying at confirmation', { group: place }, 40, 'confirmation', true],
      ])('for %s', (_name, registration, due, paymentTime, expected) => {
        expect(shouldParticipantPay({ paymentTime }, registration, due)).toBe(expected)
      })
    })

    it('getParticipantPaymentState asks nothing of a reserve whose fee went back, and the fee once it has a place', () => {
      const returned = {
        ...member,
        owner: { membership: false },
        paidAmount: 40,
        paymentStatus: 'SUCCESS' as const,
        refundAmount: 40,
      }
      const priced = { ...event, paymentTime: 'registration' as const }
      expect(getParticipantPaymentState(priced, { ...returned, group: { key: 'reserve' } })).toEqual({
        paymentDue: 0,
        shouldPay: false,
      })
      expect(getParticipantPaymentState(priced, { ...returned, group: { key: '2026-08-15-ap' } })).toEqual({
        paymentDue: 40,
        shouldPay: true,
      })
    })

    describe('getShownPaymentDue', () => {
      const shown = { ...eventWithStaticDates, cost: 40, costMember: 35 }
      it('shows what is owed once the trial is confirmed', () => {
        expect(getShownPaymentDue({ ...shown, state: 'confirmed' }, { ...member, owner: { membership: false } })).toBe(
          40
        )
      })

      it('shows nothing owed before the trial is confirmed', () => {
        expect(getShownPaymentDue({ ...shown, state: 'tentative' }, { ...member, owner: { membership: false } })).toBe(
          0
        )
      })
    })

    it.each<[string, Parameters<typeof isPaymentOffered>[0], boolean, boolean]>([
      ['when the server says to pay', { shouldPay: true }, false, true],
      ['when the server says not to', { shouldPay: false }, false, false],
      ['without an answer', {}, false, false],
      ['for a payment charged twice', { paymentStatus: 'DUPLICATE', shouldPay: true }, false, false],
      ['while a payment is being verified', { shouldPay: true }, true, false],
    ])('isPaymentOffered offers paying %s: %s', (_name, registration, verifying, expected) => {
      expect(isPaymentOffered(registration, verifying)).toBe(expected)
    })

    it.each([
      ['paymentStatus.success', true],
      ['paymentStatus.partial', true],
      ['paymentStatus.refunded', false],
      ['paymentStatus.missing', false],
      ['paymentStatus.pending', false],
    ] as const)('isPaidStatus reads %s as paid: %s', (status, expected) => {
      expect(isPaidStatus(status)).toBe(expected)
    })
  })

  describe('isPaytrailRefusal', () => {
    it.each([
      ['a marked refusal', { error: 'Revert failed', provider: 'paytrail' }, true],
      ['a marked refusal without words', { error: '', provider: 'paytrail' }, true],
      ['a marked body without an error', { provider: 'paytrail' }, false],
      ["the API's own error", { error: 'Forbidden' }, false],
      ['another provider', { error: 'x', provider: 'nordea' }, false],
      ['text', 'Refund already in progress', false],
    ])('takes %s as %s', (_case, body, expected) => {
      expect(isPaytrailRefusal(body)).toBe(expected)
    })
  })

  // What PaymentCreate and RefundCreate answer when Paytrail refuses, and isPaytrailRefusal reads it back.
  describe('paytrailRefusalBody', () => {
    it.each([
      ['its words', '{"message":"Rejected"}', '{"message":"Rejected"}'],
      ['an empty error for no words', undefined, ''],
    ])('marks a refusal with %s', (_case, error, expected) => {
      const body = paytrailRefusalBody(error)

      expect(body).toEqual({ error: expected, provider: 'paytrail' })
      expect(isPaytrailRefusal(body)).toBe(true)
    })
  })

  // What Paytrail said: its JSON `message`, else whatever text it gave (an HTML or plain 5xx, or why
  // the request failed), else nothing (KOE-1511).
  describe('paytrailErrorText', () => {
    it.each([
      [
        'its JSON message',
        JSON.stringify({ message: 'Revert failed', status: 'error' }),
        'Revert failed',
        'Revert failed',
      ],
      ['JSON without a message as it came', JSON.stringify({ status: 'error' }), '{"status":"error"}', undefined],
      ['JSON with an empty message as it came', JSON.stringify({ message: '' }), '{"message":""}', undefined],
      ['a JSON value that is not an object as it came', '"busy"', '"busy"', undefined],
      ['plain text as it came', 'Service Unavailable', 'Service Unavailable', undefined],
      ['nothing for an empty answer', '', undefined, undefined],
      ['nothing for no answer', undefined, undefined, undefined],
    ])('reads %s', (_case, error, text, message) => {
      expect(paytrailErrorText(error)).toBe(text)
      expect(paytrailErrorMessage(error)).toBe(message)
    })
  })

  describe('getProviderName', () => {
    it.each(Object.entries(PROVIDER_NAMES))('should return provider name from map', (id, name) => {
      expect(getProviderName(id)).toEqual(name)
    })

    it('should fallback to capitalizing name', () => {
      expect(getProviderName('test')).toEqual('Test')
    })
  })

  describe('transactionActor', () => {
    it('names the user the transaction recorded', () => {
      expect(transactionActor({ user: 'Test User' })).toEqual({ name: 'Test User' })
    })

    it('keeps the mark of a name taken from the registration', () => {
      expect(transactionActor({ user: 'Payer Name', userSource: 'registration' })).toEqual({
        name: 'Payer Name',
        source: 'registration',
      })
    })

    it('falls back to anonymous for a transaction without a user', () => {
      expect(transactionActor({})).toEqual({ name: 'anonymous' })
    })
  })

  describe('getPaymentStatus', () => {
    it.each<[PaymentStatus | undefined, string]>([
      ['SUCCESS', 'paymentStatus.success'],
      ['DUPLICATE', 'paymentStatus.duplicate'],
      ['PENDING', 'paymentStatus.pending'],
      [undefined, 'paymentStatus.missing'],
    ])('When status is %p should return %p', (paymentStatus, expected) => {
      expect(getPaymentStatus({ paymentStatus })).toEqual(expected)
    })

    it('names the missing part when a paid fee still owes (KOE-722)', () => {
      expect(getPaymentStatus({ paymentStatus: 'SUCCESS' }, undefined, 5)).toEqual('paymentStatus.partial')
      expect(getPaymentStatus({ paymentStatus: 'SUCCESS' }, undefined, 0)).toEqual('paymentStatus.success')
      expect(getPaymentStatus({ paymentStatus: undefined }, undefined, 5)).toEqual('paymentStatus.missing')
    })

    describe('a fee that has been returned (KOE-1526)', () => {
      const returned = { paidAmount: 50, paymentStatus: 'SUCCESS' as const, refundAmount: 45, refundHandlingCost: 5 }

      it('says the fee was refunded when nothing is owed', () => {
        expect(getPaymentStatus(returned, undefined, 0)).toEqual('paymentStatus.refunded')
      })

      it('says the fee is missing once the place owes it again', () => {
        expect(getPaymentStatus(returned, undefined, 45)).toEqual('paymentStatus.missing')
      })

      it.each(['CANCEL', 'NEW'] as const)(
        'says the fee was refunded when the next payment attempt left %s',
        (paymentStatus) => {
          expect(getPaymentStatus({ ...returned, paymentStatus }, undefined, 0)).toEqual('paymentStatus.refunded')
        }
      )

      it('still reads as paid when only an overpaid part was refunded', () => {
        expect(getPaymentStatus({ ...returned, refundAmount: 10, refundHandlingCost: 0 }, undefined, 0)).toEqual(
          'paymentStatus.success'
        )
      })
    })

    describe('with event parameter', () => {
      // At confirmation-time payment the line follows the pay offer: the server's shouldPay, which
      // reads the place, not the confirmation (KOE-1526 review).
      it('should return waitingForConfirmation when paymentTime is confirmation and paying is not offered', () => {
        expect(
          getPaymentStatus({ paymentStatus: undefined, shouldPay: false }, { paymentTime: 'confirmation' })
        ).toEqual('paymentStatus.waitingForConfirmation')
      })

      it('should return missing when paymentTime is confirmation and paying is offered before confirming', () => {
        expect(
          getPaymentStatus({ paymentStatus: undefined, shouldPay: true }, { paymentTime: 'confirmation' })
        ).toEqual('paymentStatus.missing')
      })

      it("should read a secretary's row by its group", () => {
        expect(
          getPaymentStatus(
            { group: { key: '2026-08-15-ap' }, paymentStatus: undefined },
            { paymentTime: 'confirmation' }
          )
        ).toEqual('paymentStatus.missing')
      })

      it('should return missing when paymentTime is registration and registration not confirmed', () => {
        expect(getPaymentStatus({ paymentStatus: undefined }, { paymentTime: 'registration' })).toEqual(
          'paymentStatus.missing'
        )
      })

      it('should return success when payment is successful regardless of confirmation state', () => {
        expect(getPaymentStatus({ paymentStatus: 'SUCCESS' }, { paymentTime: 'confirmation' })).toEqual(
          'paymentStatus.success'
        )
      })

      it('should return pending when payment is pending regardless of confirmation state', () => {
        expect(getPaymentStatus({ paymentStatus: 'PENDING' }, { paymentTime: 'confirmation' })).toEqual(
          'paymentStatus.pending'
        )
      })
    })
  })

  describe('isRegistrationPaid', () => {
    const event: MinimalEventForCost = { cost: 40, costMember: 40, entryStartDate: new Date('2026-01-01') }
    const registration: MinimalRegistrationForCost &
      Pick<Registration, 'paymentStatus' | 'refundAmount' | 'refundHandlingCost'> = {
      createdAt: new Date('2026-01-02'),
      dog: { breedCode: '110' },
      owner: { membership: false },
      ownerHandles: true,
    }

    it('is not paid when nothing has been paid for a place that costs', () => {
      expect(isRegistrationPaid(event, registration)).toBe(false)
    })

    it('is paid when the payment succeeded', () => {
      expect(isRegistrationPaid(event, { ...registration, paidAmount: 40, paymentStatus: 'SUCCESS' })).toBe(true)
    })

    it('is paid when only part of the fee has arrived', () => {
      expect(isRegistrationPaid(event, { ...registration, paidAmount: 10 })).toBe(true)
    })

    it('is paid when the place costs nothing', () => {
      expect(isRegistrationPaid({ ...event, cost: 0, costMember: 0 }, registration)).toBe(true)
    })

    it('is not paid while the payment is only pending', () => {
      expect(isRegistrationPaid(event, { ...registration, paymentStatus: 'PENDING' })).toBe(false)
    })

    it('is paid when a payment was recorded before the amounts were kept', () => {
      expect(isRegistrationPaid(event, { ...registration, paymentStatus: 'SUCCESS' })).toBe(true)
    })

    it.each([
      ['in full', { refundAmount: 40, refundHandlingCost: 0 }],
      ['less a handling fee', { refundAmount: 35, refundHandlingCost: 5 }],
    ])('is not paid once the payment was refunded %s (KOE-1526)', (_name, refund) => {
      expect(isRegistrationPaid(event, { ...registration, paidAmount: 40, paymentStatus: 'SUCCESS', ...refund })).toBe(
        false
      )
    })

    it('is paid when part of the payment is left after a refund (KOE-1526)', () => {
      expect(
        isRegistrationPaid(event, {
          ...registration,
          paidAmount: 50,
          paymentStatus: 'SUCCESS',
          refundAmount: 35,
          refundHandlingCost: 5,
        })
      ).toBe(true)
    })
  })

  describe('invitation payment gate', () => {
    // The ALO class has been invited; the trial itself is only picked, as it is when one class is ahead.
    const event = {
      classes: [{ class: 'ALO' as const, state: 'invited' as const }],
      cost: 40,
      costMember: 40,
      entryStartDate: new Date('2026-01-01'),
      state: 'picked' as const,
    }
    const participant = {
      class: 'ALO' as const,
      createdAt: new Date('2026-01-02'),
      dog: { breedCode: '110' as const },
      eventType: 'NOME-B',
      group: { key: 'ALO-AP', number: 3 },
      messagesSent: { picked: true },
      owner: { membership: false },
      ownerHandles: true,
    }
    const paid = { ...participant, paidAmount: 40, paymentStatus: 'SUCCESS' as const }

    it('waits for an unpaid place lifted into an invited class', () => {
      expect(isInvitationAwaitingPayment(event, participant)).toBe(true)
      expect(shouldSendInvitationAfterPayment(event, participant)).toBe(false)
    })

    it('waits for a reserve whose fee was refunded and that is then lifted into a place (KOE-1526)', () => {
      const refunded = { ...paid, refundAmount: 40, refundHandlingCost: 0 }
      expect(isInvitationAwaitingPayment(event, refunded)).toBe(true)
      expect(shouldSendInvitationAfterPayment(event, refunded)).toBe(false)
    })

    it('sends once that place is paid for', () => {
      expect(isInvitationAwaitingPayment(event, paid)).toBe(false)
      expect(shouldSendInvitationAfterPayment(event, paid)).toBe(true)
    })

    it('leaves a dog on the reserve list out of both', () => {
      const reserve = { ...participant, group: { key: 'reserve', number: 1 } }

      expect(isInvitationAwaitingPayment(event, reserve)).toBe(false)
      expect(shouldSendInvitationAfterPayment(event, { ...reserve, ...paid, group: reserve.group })).toBe(false)
    })

    it('leaves a cancelled entry out of both', () => {
      const cancelled = { ...paid, cancelled: true }

      expect(isInvitationAwaitingPayment(event, { ...participant, cancelled: true })).toBe(false)
      expect(shouldSendInvitationAfterPayment(event, cancelled)).toBe(false)
    })

    it('waits for the class to be invited', () => {
      const pickedEvent = { ...event, classes: [{ class: 'ALO' as const, state: 'picked' as const }] }

      expect(isInvitationAwaitingPayment(pickedEvent, participant)).toBe(false)
      expect(shouldSendInvitationAfterPayment(pickedEvent, paid)).toBe(false)
    })

    it('does not repeat an invitation that has been sent', () => {
      const invited = { ...paid, messagesSent: { invitation: true, picked: true } }

      expect(isInvitationAwaitingPayment(event, { ...participant, messagesSent: invited.messagesSent })).toBe(false)
      expect(shouldSendInvitationAfterPayment(event, invited)).toBe(false)
    })
  })

  describe('getRegistrationPaymentDetails', () => {
    const event: MinimalEventForCost = {
      cost: 10,
      costMember: 5,
      entryStartDate: new Date('2026-01-01'),
    }
    const registration: MinimalRegistrationForCost = {
      createdAt: new Date('2026-01-02'),
      dog: {},
      ownerHandles: true,
    }

    it('should return details for non-member', () => {
      expect(getRegistrationPaymentDetails(event, { ...registration, owner: { membership: false } })).toEqual({
        cost: 10,
        isMember: false,
        optionalCosts: [],
        strategy: 'legacy',
        total: 10,
      })
    })

    it('should return details for member', () => {
      expect(getRegistrationPaymentDetails(event, { ...registration, owner: { membership: true } })).toEqual({
        cost: 5,
        isMember: true,
        optionalCosts: [],
        strategy: 'legacy',
        total: 5,
      })
    })

    it('should return details with optional costs', () => {
      const eventWithOptional = {
        ...event,
        cost: {
          normal: 10,
          optionalAdditionalCosts: [{ cost: 2, description: { fi: 'test' } }],
        },
      }
      const registrationWithOptional = {
        ...registration,
        optionalCosts: [0],
        owner: { membership: false },
      }
      expect(getRegistrationPaymentDetails(eventWithOptional, registrationWithOptional)).toEqual({
        cost: 10,
        costObject: {
          normal: 10,
          optionalAdditionalCosts: [
            {
              cost: 2,
              description: {
                fi: 'test',
              },
            },
          ],
        },
        isMember: false,
        optionalCosts: [{ cost: 2, description: { fi: 'test' } }],
        strategy: 'normal',
        total: 12,
        translationOptions: {
          code: undefined,
          end: undefined,
          start: undefined,
        },
      })
    })
    it('should return details for early bird', () => {
      const entryStartDate = new Date()
      const eventWithOptional = {
        ...event,
        cost: {
          earlyBird: {
            cost: 7,
            days: 10,
          },
          normal: 10,
        },
        entryStartDate,
      }
      const registrationWithOptional = {
        ...registration,
        createdAt: new Date(),
        owner: { membership: false },
      }
      expect(getRegistrationPaymentDetails(eventWithOptional, registrationWithOptional)).toEqual({
        cost: 7,
        costObject: {
          earlyBird: {
            cost: 7,
            days: 10,
          },
          normal: 10,
        },
        isMember: false,
        optionalCosts: [],
        strategy: 'earlyBird',
        total: 7,
        translationOptions: {
          code: undefined,
          end: addDays(entryStartDate, 9),
          start: entryStartDate,
        },
      })
    })

    it('should return details for breed', () => {
      const eventWithOptional = {
        ...event,
        cost: {
          breed: {
            '101': 6,
          },
          normal: 10,
        },
      }
      const registrationWithOptional = {
        ...registration,
        dog: { breedCode: '101' as const },
        owner: { membership: false },
      }
      expect(getRegistrationPaymentDetails(eventWithOptional, registrationWithOptional)).toEqual({
        cost: 6,
        costObject: {
          breed: {
            '101': 6,
          },
          normal: 10,
        },
        isMember: false,
        optionalCosts: [],
        strategy: 'breed',
        total: 6,
        translationOptions: {
          code: '101',
          end: undefined,
          start: undefined,
        },
      })
    })

    it('should return details for custom cost', () => {
      const eventWithOptional = {
        ...event,
        cost: {
          custom: {
            cost: 1,
            description: { en: 'Volunteer', fi: 'Talkoolainen' },
          },
          normal: 10,
        },
      }
      const registrationWithOptional = {
        ...registration,
        owner: { membership: false },
        selectedCost: 'custom' as const,
      }
      expect(getRegistrationPaymentDetails(eventWithOptional, registrationWithOptional)).toEqual({
        cost: 1,
        costObject: {
          custom: {
            cost: 1,
            description: {
              en: 'Volunteer',
              fi: 'Talkoolainen',
            },
          },
          normal: 10,
        },
        isMember: false,
        optionalCosts: [],
        strategy: 'custom',
        total: 1,
        translationOptions: {
          code: undefined,
          end: undefined,
          start: undefined,
        },
      })
    })
  })

  describe('overpaid fee', () => {
    const event: MinimalEventForCost = { cost: 40, costMember: 35, entryStartDate: new Date('2026-01-01') }
    const member: MinimalRegistrationForCost = {
      createdAt: new Date('2026-01-02'),
      dog: { breedCode: '110' },
      owner: { membership: true },
      ownerHandles: true,
    }

    describe('canRefundExcess', () => {
      it('lets a participant who paid the full price as a member have the difference back (KOE-1382)', () => {
        expect(canRefundExcess(event, { ...member, paidAmount: 40 })).toBe(true)
      })

      it('has nothing to return once the difference has been refunded', () => {
        expect(canRefundExcess(event, { ...member, paidAmount: 40, refundAmount: 5 })).toBe(false)
      })

      it('has nothing to return when the member price was paid', () => {
        expect(canRefundExcess(event, { ...member, paidAmount: 35 })).toBe(false)
      })

      it('leaves a cancelled entry to the ordinary refund', () => {
        expect(canRefundExcess(event, { ...member, cancelled: true, paidAmount: 40 })).toBe(false)
      })
    })

    describe('isPaymentUnsettled', () => {
      const paidAt = new Date('2026-01-03')

      it('is unsettled when a part is missing or paid over', () => {
        expect(isPaymentUnsettled(event, { ...member, paidAmount: 40, paidAt })).toBe(true)
        expect(isPaymentUnsettled(event, { ...member, owner: { membership: false }, paidAmount: 35, paidAt })).toBe(
          true
        )
      })

      it('is settled when the fee has been paid as it reads', () => {
        expect(isPaymentUnsettled(event, { ...member, paidAmount: 35, paidAt })).toBe(false)
      })

      it('is not unsettled, only unpaid, when nothing has been paid', () => {
        expect(isPaymentUnsettled(event, member)).toBe(false)
      })

      // The prod row of KOE-1526: reserve #1, paid 40 and had all of it back.
      const refundedReserve = {
        ...member,
        group: { key: 'reserve', number: 1 },
        owner: { membership: false },
        paidAmount: 40,
        paidAt,
        paymentStatus: 'SUCCESS' as const,
        refundAmount: 40,
        refundHandlingCost: 0,
      }

      it('is settled for a reserve whose fee was refunded (KOE-1526)', () => {
        expect(isPaymentUnsettled(event, refundedReserve)).toBe(false)
      })

      it('is settled, with nothing to refund, once the lifted reserve has paid its fee again (KOE-1526)', () => {
        // Paid 40, had 35 back with 5 kept, lifted, paid 40 again: the kept 5 is not paid over.
        const repaid = {
          ...refundedReserve,
          group: { key: '2026-08-15-ap', number: 1 },
          paidAmount: 80,
          refundAmount: 35,
          refundHandlingCost: 5,
        }
        expect(isPaymentUnsettled(event, repaid)).toBe(false)
        expect(canRefundExcess(event, repaid)).toBe(false)
      })

      it('is unsettled when that reserve is lifted into a place (KOE-1526)', () => {
        const place = { key: '2026-08-15-ap', number: 1 }
        expect(isPaymentUnsettled(event, { ...refundedReserve, group: place })).toBe(true)
      })
    })
  })
})
