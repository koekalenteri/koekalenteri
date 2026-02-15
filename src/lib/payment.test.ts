import type { PaymentStatus } from '../types'

import { addDays } from 'date-fns'

import { getPaymentStatus, getProviderName, getRegistrationPaymentDetails, PROVIDER_NAMES } from './payment'

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
      ['PENDING', 'paymentStatus.pending'],
      [undefined, 'paymentStatus.missing'],
    ])('When status is %p should return %p', (paymentStatus, expected) => {
      expect(getPaymentStatus({ paymentStatus })).toEqual(expected)
    })

    describe('with event parameter', () => {
      it('should return waitingForConfirmation when paymentTime is confirmation and registration not confirmed', () => {
        expect(
          getPaymentStatus({ paymentStatus: undefined, confirmed: false }, { paymentTime: 'confirmation' })
        ).toEqual('paymentStatus.waitingForConfirmation')
      })

      it('should return missing when paymentTime is confirmation and registration is confirmed', () => {
        expect(
          getPaymentStatus({ paymentStatus: undefined, confirmed: true }, { paymentTime: 'confirmation' })
        ).toEqual('paymentStatus.missing')
      })

      it('should return missing when paymentTime is registration and registration not confirmed', () => {
        expect(
          getPaymentStatus({ paymentStatus: undefined, confirmed: false }, { paymentTime: 'registration' })
        ).toEqual('paymentStatus.missing')
      })

      it('should return success when payment is successful regardless of confirmation state', () => {
        expect(
          getPaymentStatus({ paymentStatus: 'SUCCESS', confirmed: false }, { paymentTime: 'confirmation' })
        ).toEqual('paymentStatus.success')
      })

      it('should return pending when payment is pending regardless of confirmation state', () => {
        expect(
          getPaymentStatus({ paymentStatus: 'PENDING', confirmed: false }, { paymentTime: 'confirmation' })
        ).toEqual('paymentStatus.pending')
      })
    })
  })

  describe('getRegistrationPaymentDetails', () => {
    const event: any = {
      cost: 10,
      costMember: 5,
    }
    const registration: any = {
      ownerHandles: true,
      dog: {},
    }

    it('should return details for non-member', () => {
      expect(getRegistrationPaymentDetails(event, { ...registration, owner: { membership: false } })).toEqual({
        strategy: 'legacy',
        isMember: false,
        cost: 10,
        optionalCosts: [],
        total: 10,
      })
    })

    it('should return details for member', () => {
      expect(getRegistrationPaymentDetails(event, { ...registration, owner: { membership: true } })).toEqual({
        strategy: 'legacy',
        isMember: true,
        cost: 5,
        optionalCosts: [],
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
        owner: { membership: false },
        optionalCosts: [0],
      }
      expect(getRegistrationPaymentDetails(eventWithOptional, registrationWithOptional)).toEqual({
        strategy: 'normal',
        isMember: false,
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
        optionalCosts: [{ description: { fi: 'test' }, cost: 2 }],
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
          normal: 10,
          earlyBird: {
            cost: 7,
            days: 10,
          },
        },
        entryStartDate,
      }
      const registrationWithOptional = {
        ...registration,
        owner: { membership: false },
        createdAt: new Date(),
      }
      expect(getRegistrationPaymentDetails(eventWithOptional, registrationWithOptional)).toEqual({
        strategy: 'earlyBird',
        isMember: false,
        cost: 7,
        costObject: {
          earlyBird: {
            cost: 7,
            days: 10,
          },
          normal: 10,
        },
        optionalCosts: [],
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
          normal: 10,
          breed: {
            '101': 6,
          },
        },
      }
      const registrationWithOptional = {
        ...registration,
        owner: { membership: false },
        dog: { breedCode: '101' },
      }
      expect(getRegistrationPaymentDetails(eventWithOptional, registrationWithOptional)).toEqual({
        strategy: 'breed',
        isMember: false,
        cost: 6,
        costObject: {
          breed: {
            '101': 6,
          },
          normal: 10,
        },
        optionalCosts: [],
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
          normal: 10,
          custom: {
            cost: 1,
            description: { fi: 'Talkoolainen', en: 'Volunteer' },
          },
        },
      }
      const registrationWithOptional = {
        ...registration,
        owner: { membership: false },
        selectedCost: 'custom',
      }
      expect(getRegistrationPaymentDetails(eventWithOptional, registrationWithOptional)).toEqual({
        strategy: 'custom',
        isMember: false,
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
        optionalCosts: [],
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
