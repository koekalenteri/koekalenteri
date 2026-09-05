import type { MinimalEventForCost, MinimalRegistrationForCost, PaymentStatus, Registration } from '../types'
import { addDays } from 'date-fns'
import {
  getPaymentStatus,
  getProviderName,
  getRegistrationPaymentDetails,
  isInvitationAwaitingPayment,
  isRegistrationPaid,
  PROVIDER_NAMES,
  shouldSendInvitationAfterPayment,
} from './payment'

describe('payment', () => {
  describe('getProviderName', () => {
    it.each(Object.entries(PROVIDER_NAMES))('should return provider name from map', (id, name) => {
      expect(getProviderName(id)).toEqual(name)
    })

    it('should fallback to capitalizing name', () => {
      expect(getProviderName('test')).toEqual('Test')
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

    describe('with event parameter', () => {
      it('should return waitingForConfirmation when paymentTime is confirmation and registration not confirmed', () => {
        expect(
          getPaymentStatus({ confirmed: false, paymentStatus: undefined }, { paymentTime: 'confirmation' })
        ).toEqual('paymentStatus.waitingForConfirmation')
      })

      it('should return missing when paymentTime is confirmation and registration is confirmed', () => {
        expect(
          getPaymentStatus({ confirmed: true, paymentStatus: undefined }, { paymentTime: 'confirmation' })
        ).toEqual('paymentStatus.missing')
      })

      it('should return missing when paymentTime is registration and registration not confirmed', () => {
        expect(
          getPaymentStatus({ confirmed: false, paymentStatus: undefined }, { paymentTime: 'registration' })
        ).toEqual('paymentStatus.missing')
      })

      it('should return success when payment is successful regardless of confirmation state', () => {
        expect(
          getPaymentStatus({ confirmed: false, paymentStatus: 'SUCCESS' }, { paymentTime: 'confirmation' })
        ).toEqual('paymentStatus.success')
      })

      it('should return pending when payment is pending regardless of confirmation state', () => {
        expect(
          getPaymentStatus({ confirmed: false, paymentStatus: 'PENDING' }, { paymentTime: 'confirmation' })
        ).toEqual('paymentStatus.pending')
      })
    })
  })

  describe('isRegistrationPaid', () => {
    const event: MinimalEventForCost = { cost: 40, costMember: 40, entryStartDate: new Date('2026-01-01') }
    const registration: MinimalRegistrationForCost & Pick<Registration, 'paymentStatus'> = {
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
    const event: any = {
      cost: 10,
      costMember: 5,
    }
    const registration: any = {
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
        dog: { breedCode: '101' },
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
        selectedCost: 'custom',
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
})
