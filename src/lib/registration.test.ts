import type { JsonQualifyingResult, QualifyingResult, RegistrationClass } from '../types'
import type { SortableRegistration } from './registration'

import { PRIORITY_INVITED, PRIORITY_MEMBER, PRIORIZED_BREED_CODES } from './priority'
import {
  canRefund,
  getNextClass,
  getRegistrationEmailTemplateData,
  getRegistrationGroupKey,
  getRegistrationNumberingGroupKey,
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  hasPriority,
  isMember,
  isPredefinedReason,
  isRegistrationClass,
  priorityDescriptionKey,
  sortRegistrationsByDateClassTimeAndNumber,
} from './registration'

describe('lib/registration', () => {
  describe('hasPriority', () => {
    it('should return false when nobody is priorized', () => {
      expect(
        hasPriority(
          {},
          {
            owner: {
              membership: true,
            },
            handler: {
              membership: true,
            },
            priorityByInvitation: true,
          }
        )
      ).toEqual(false)
    })

    describe('membership priority', () => {
      const event = { priority: [PRIORITY_MEMBER] }

      it.each`
        owner    | handler  | result
        ${false} | ${false} | ${false}
        ${true}  | ${false} | ${0.5}
        ${false} | ${true}  | ${0.5}
        ${true}  | ${true}  | ${true}
      `(
        'should return $result when owner membersio is $owner and handler membership is $handler',
        ({ owner, handler, result }) => {
          expect(
            hasPriority(event, {
              owner: {
                membership: owner,
              },
              handler: {
                membership: handler,
              },
              dog: {},
              priorityByInvitation: true,
            })
          ).toEqual(result)
        }
      )
    })

    describe('priority by invitation', () => {
      const event = { priority: [PRIORITY_INVITED] }
      it('should return true when invited', () => {
        expect(hasPriority(event, { priorityByInvitation: true })).toEqual(true)
      })
      it('should return false when not invited', () => {
        expect(hasPriority(event, { priorityByInvitation: false })).toEqual(false)
        expect(hasPriority(event, {})).toEqual(false)
      })
    })

    describe('breed priority', () => {
      it.each(PRIORIZED_BREED_CODES)('should work for breedCode %p', (breedCode) => {
        expect(hasPriority({ priority: [breedCode] }, { dog: { breedCode } })).toEqual(true)
        expect(hasPriority({ priority: [...PRIORIZED_BREED_CODES] }, { dog: { breedCode } })).toEqual(true)

        expect(hasPriority({ priority: [breedCode] }, { dog: { breedCode: '1' } })).toEqual(false)
        expect(hasPriority({ priority: [breedCode] }, {})).toEqual(false)
      })
    })

    describe('NOME-B SM priority', () => {
      const NOME_B_VOI1: Readonly<QualifyingResult> = {
        result: 'VOI1',
        official: false,
        date: new Date('2024-06-06'),
        location: 'Somewhere',
        class: 'VOI',
        type: 'NOME-B',
        judge: 'Some One',
      }
      const NOME_B_VOI2: Readonly<QualifyingResult> = {
        ...NOME_B_VOI1,
        result: 'VOI2',
      }
      const NOME_B_KVA_NEW: Readonly<QualifyingResult> = {
        ...NOME_B_VOI1,
        result: 'FI KVA-B',
      }
      const NOME_B_KVA_OLD: Readonly<QualifyingResult> = {
        ...NOME_B_KVA_NEW,
        date: new Date('2023-06-06'),
      }
      it.each<Array<QualifyingResult> | Array<JsonQualifyingResult>>([
        [],
        [NOME_B_VOI1],
        [NOME_B_VOI1, NOME_B_VOI1],
        [NOME_B_VOI1, NOME_B_VOI1, NOME_B_VOI2],
        [NOME_B_VOI1, NOME_B_VOI1, NOME_B_KVA_NEW],
        JSON.parse(JSON.stringify([NOME_B_VOI1, NOME_B_VOI1, NOME_B_KVA_NEW])),
      ])('should return false when not prirized', (...qualifyingResults) => {
        expect(hasPriority({ eventType: 'NOME-B SM' }, { qualifyingResults })).toEqual(false)
      })

      it.each<Array<QualifyingResult>>([
        [NOME_B_VOI1, NOME_B_VOI1, NOME_B_VOI1],
        [NOME_B_VOI1, NOME_B_VOI1, NOME_B_KVA_OLD],
      ])('should return true when prirized', (...qualifyingResults) => {
        expect(hasPriority({ eventType: 'NOME-B SM' }, { qualifyingResults })).toEqual(true)
      })
    })
  })

  describe('priorityDescriptionKey', () => {
    it('should return undefined when nobody is priorized', () => {
      expect(priorityDescriptionKey({}, {})).toEqual(undefined)
    })

    describe('membership priority', () => {
      const event = { priority: [PRIORITY_MEMBER] }

      it.each`
        owner    | handler  | result
        ${false} | ${false} | ${undefined}
        ${true}  | ${false} | ${PRIORITY_MEMBER}
        ${false} | ${true}  | ${PRIORITY_MEMBER}
        ${true}  | ${true}  | ${PRIORITY_MEMBER}
      `(
        'should return $result when owner membersio is $owner and handler membership is $handler',
        ({ owner, handler, result }) => {
          expect(
            priorityDescriptionKey(event, {
              owner: {
                membership: owner,
              },
              handler: {
                membership: handler,
              },
              dog: {},
              priorityByInvitation: true,
            })
          ).toEqual(result)
        }
      )
    })

    describe('priority by invitation', () => {
      const event = { priority: [PRIORITY_INVITED] }
      it('should return "invited" when invited', () => {
        expect(priorityDescriptionKey(event, { priorityByInvitation: true })).toEqual(PRIORITY_INVITED)
      })
      it('should return undefined when not invited', () => {
        expect(priorityDescriptionKey(event, { priorityByInvitation: false })).toEqual(undefined)
        expect(priorityDescriptionKey(event, {})).toEqual(undefined)
      })
    })

    describe('breed priority', () => {
      it.each(PRIORIZED_BREED_CODES)('should work for breedCode %p', (breedCode) => {
        expect(priorityDescriptionKey({ priority: [breedCode] }, { dog: { breedCode } })).toEqual('breed')
        expect(priorityDescriptionKey({ priority: [...PRIORIZED_BREED_CODES] }, { dog: { breedCode } })).toEqual(
          'breed'
        )

        expect(priorityDescriptionKey({ priority: [breedCode] }, { dog: { breedCode: '1' } })).toEqual(undefined)
        expect(priorityDescriptionKey({ priority: [breedCode] }, {})).toEqual(undefined)
      })
    })

    describe('NOME-B SM priority', () => {
      const NOME_B_VOI1: Readonly<QualifyingResult> = {
        result: 'VOI1',
        official: false,
        date: new Date('2024-06-06'),
        location: 'Somewhere',
        class: 'VOI',
        type: 'NOME-B',
        judge: 'Some One',
      }
      const NOME_B_VOI2: Readonly<QualifyingResult> = {
        ...NOME_B_VOI1,
        result: 'VOI2',
      }
      const NOME_B_KVA_NEW: Readonly<QualifyingResult> = {
        ...NOME_B_VOI1,
        result: 'FI KVA-B',
      }
      const NOME_B_KVA_OLD: Readonly<QualifyingResult> = {
        ...NOME_B_KVA_NEW,
        date: new Date('2023-06-06'),
      }
      it.each<Array<QualifyingResult> | Array<JsonQualifyingResult>>([
        [],
        [NOME_B_VOI1],
        [NOME_B_VOI1, NOME_B_VOI1],
        [NOME_B_VOI1, NOME_B_VOI1, NOME_B_VOI2],
        [NOME_B_VOI1, NOME_B_VOI1, NOME_B_KVA_NEW],
        JSON.parse(JSON.stringify([NOME_B_VOI1, NOME_B_VOI1, NOME_B_KVA_NEW])),
      ])('should return undefined when not prirized', (...qualifyingResults) => {
        expect(priorityDescriptionKey({ eventType: 'NOME-B SM' }, { qualifyingResults })).toEqual(undefined)
      })

      it('should return "b-sm.3" with 3xVOI1', () => {
        expect(
          priorityDescriptionKey(
            { eventType: 'NOME-B SM' },
            { qualifyingResults: [NOME_B_VOI1, NOME_B_VOI1, NOME_B_VOI1] }
          )
        ).toEqual('b-sm.3')
      })

      it('should return "b-sm.2" with 2xVOI1 + KVA', () => {
        expect(
          priorityDescriptionKey(
            { eventType: 'NOME-B SM' },
            { qualifyingResults: [NOME_B_VOI1, NOME_B_VOI1, NOME_B_KVA_OLD] }
          )
        ).toEqual('b-sm.2')
      })
    })
  })

  describe('sortRegistrationsByDateClassTimeAndNumber', () => {
    it('should sort registrations properly', () => {
      const regs: SortableRegistration[] = [
        { group: { date: '2024-08-02T21:00:00.000Z', number: 19, time: 'ip', key: '2024-08-02-ip' } },
        { group: { date: '2024-08-02T21:00:00.000Z', number: 20, time: 'ip', key: '2024-08-02-ip' } },
        { group: { date: '2024-08-02T21:00:00.000Z', number: 23.5, time: 'ip', key: '2024-08-02-ip' } },
        { group: { date: '2024-08-02T21:00:00.000Z', number: 22, time: 'ip', key: '2024-08-02-ip' } },
        { group: { date: '2024-08-02T21:00:00.000Z', number: 23, time: 'ip', key: '2024-08-02-ip' } },
        { group: { date: '2024-08-02T21:00:00.000Z', number: 24, time: 'ip', key: '2024-08-02-ip' } },
      ]
      regs.sort(sortRegistrationsByDateClassTimeAndNumber)
      expect(regs.map((r) => r.group?.number)).toEqual([19, 20, 22, 23, 23.5, 24])
    })

    it('should value null and undefined class the same as missing class', () => {
      const regs2: SortableRegistration[] = [
        { group: { date: '2024-08-02T21:00:00.000Z', number: 19, time: 'ip', key: '2024-08-02-ip' } },
        { class: undefined, group: { date: '2024-08-02T21:00:00.000Z', number: 20, time: 'ip', key: '2024-08-02-ip' } },
        { class: null, group: { date: '2024-08-02T21:00:00.000Z', number: 23.5, time: 'ip', key: '2024-08-02-ip' } },
        { group: { date: '2024-08-02T21:00:00.000Z', number: 22, time: 'ip', key: '2024-08-02-ip' } },
        { group: { date: '2024-08-02T21:00:00.000Z', number: 23, time: 'ip', key: '2024-08-02-ip' } },
        { group: { date: '2024-08-02T21:00:00.000Z', number: 24, time: 'ip', key: '2024-08-02-ip' } },
      ]
      regs2.sort(sortRegistrationsByDateClassTimeAndNumber)
      expect(regs2.map((r) => r.group?.number)).toEqual([19, 20, 22, 23, 23.5, 24])
    })
  })

  describe('getRegistrationNumberingGroupKey', () => {
    it('should return cancelled for class or eventType', () => {
      expect(getRegistrationNumberingGroupKey({ cancelled: true, class: 'AVO', eventType: 'NOME-B' })).toEqual(
        'cancelled-AVO'
      )
      expect(getRegistrationNumberingGroupKey({ cancelled: true, eventType: 'NOU' })).toEqual('cancelled-NOU')
    })

    it('should return participants if group has date', () => {
      expect(
        getRegistrationNumberingGroupKey({
          class: 'AVO',
          eventType: 'NOME-B',
          group: { key: 'test', number: 1, date: new Date() },
        })
      ).toEqual('participants')
    })

    it('should return reserve for rest', () => {
      expect(
        getRegistrationNumberingGroupKey({
          class: 'AVO',
          eventType: 'NOME-B',
          group: { key: 'test', number: 1 },
        })
      ).toEqual('reserve-AVO')
      expect(
        getRegistrationNumberingGroupKey({
          eventType: 'NOU',
          group: { key: 'test', number: 1 },
        })
      ).toEqual('reserve-NOU')
      expect(
        getRegistrationNumberingGroupKey({
          eventType: 'NOU',
        })
      ).toEqual('reserve-NOU')
    })
  })

  describe('getRegistrationGroupKey', () => {
    it('should returen cancelled if the registration is cancelled', () => {
      expect(getRegistrationGroupKey({ cancelled: true })).toEqual(GROUP_KEY_CANCELLED)
    })

    it('should return the group.key for non-cancelled registration', () => {
      expect(getRegistrationGroupKey({ group: { key: 'test', number: 1 } })).toEqual('test')
    })

    it('should default to reserver', () => {
      expect(getRegistrationGroupKey({})).toEqual(GROUP_KEY_RESERVE)
    })
  })

  describe('canRefund', () => {
    it('should return false if registration is not paid', () => {
      expect(canRefund({})).toEqual(false)
      expect(canRefund({ cancelled: true })).toEqual(false)
      expect(canRefund({ cancelled: true, group: { key: 'cancelled', number: 1 } })).toEqual(false)
    })
    it('should return false if fully refunded', () => {
      expect(canRefund({ paidAmount: 10, refundAmount: 10, cancelled: true })).toEqual(false)
      expect(canRefund({ paidAmount: 10, refundAmount: 10 })).toEqual(false)
      expect(canRefund({ paidAmount: 10, refundAmount: 20 })).toEqual(false)
    })
    it('should return true if not fully refunded and in reserve or cancelled', () => {
      expect(canRefund({ paidAmount: 10 })).toEqual(true)
      expect(canRefund({ paidAmount: 10, cancelled: true })).toEqual(true)
      expect(canRefund({ paidAmount: 10, refundAmount: 9, cancelled: true })).toEqual(true)
      expect(canRefund({ paidAmount: 1, group: { key: 'reserve', number: 5 } })).toEqual(true)
      expect(canRefund({ paidAmount: 2, group: { key: 'cancelled', number: 5 } })).toEqual(true)
    })
    it('should return false for participant groups', () => {
      expect(canRefund({ paidAmount: 1, group: { key: 'testing', number: 1 } })).toEqual(false)
    })
  })

  describe('isRegistrationClass', () => {
    it('should return true for valid registration classes', () => {
      expect(isRegistrationClass('ALO')).toBe(true)
      expect(isRegistrationClass('AVO')).toBe(true)
      expect(isRegistrationClass('VOI')).toBe(true)
    })

    it('should return false for invalid registration classes', () => {
      expect(isRegistrationClass('INVALID')).toBe(false)
      expect(isRegistrationClass('')).toBe(false)
      expect(isRegistrationClass(null)).toBe(false)
      expect(isRegistrationClass(undefined)).toBe(false)
    })
  })

  describe('isMember', () => {
    it('should return true when owner has membership and ownerHandles is false', () => {
      expect(isMember({ owner: { membership: true }, ownerHandles: false })).toBe(true)
    })

    it('should return true when handler has membership and ownerHandles is false', () => {
      expect(isMember({ handler: { membership: true }, ownerHandles: false })).toBe(true)
    })

    it('should return true when owner has membership and ownerHandles is undefined', () => {
      expect(isMember({ owner: { membership: true } })).toBe(true)
    })

    it('should return true when handler has membership and ownerHandles is undefined', () => {
      expect(isMember({ handler: { membership: true } })).toBe(true)
    })

    it('should return true when owner has membership regardless of ownerHandles value', () => {
      expect(isMember({ owner: { membership: true }, ownerHandles: true })).toBe(true)
    })

    it('should return false when handler has membership but ownerHandles is true', () => {
      expect(isMember({ handler: { membership: true }, ownerHandles: true, owner: { membership: false } })).toBe(false)
    })

    it('should return false when neither owner nor handler has membership', () => {
      expect(isMember({ owner: { membership: false }, handler: { membership: false } })).toBe(false)
      expect(isMember({})).toBe(false)
    })

    it('should return false when registration is undefined', () => {
      expect(isMember(undefined)).toBe(false)
    })
  })

  describe('isPredefinedReason', () => {
    it('should return true for predefined reasons', () => {
      expect(isPredefinedReason('dog-heat')).toBe(true)
      expect(isPredefinedReason('handler-sick')).toBe(true)
      expect(isPredefinedReason('dog-sick')).toBe(true)
      expect(isPredefinedReason('gdpr')).toBe(true)
    })

    it('should return false for non-predefined reasons', () => {
      expect(isPredefinedReason('other')).toBe(false)
      expect(isPredefinedReason('')).toBe(false)
      expect(isPredefinedReason(undefined)).toBe(false)
    })
  })

  describe('getRegistrationEmailTemplateData', () => {
    // Create a simple mock t function with type assertion
    const t = jest.fn().mockImplementation(() => 'translated-text') as any

    it('should return an object with the expected structure', () => {
      const registration = {
        eventId: 'event1',
        id: 'reg1',
        dog: { breedCode: '123' },
        dates: [{ date: '2024-08-01', time: 'ap' }],
        reserve: 'ANY',
        qualifyingResults: [{ date: '2024-07-01', result: 'VOI1' }],
        group: { date: '2024-08-01', time: 'ap', number: 5, key: 'group1' },
        cancelReason: 'dog-sick',
      } as any

      const confirmedEvent = {
        startDate: '2024-08-01',
        endDate: '2024-08-02',
      } as any // Type assertion for event

      const origin = 'https://example.com'
      const context = 'confirmation' as any // Type assertion for context
      const text = 'Additional text'

      const result = getRegistrationEmailTemplateData(registration, confirmedEvent, origin, context, text, t)

      // Check that the result has the expected structure
      expect(result).toHaveProperty('subject')
      expect(result).toHaveProperty('title')
      expect(result).toHaveProperty('dogBreed')
      expect(result).toHaveProperty('link')
      expect(result).toHaveProperty('paymentLink')
      expect(result).toHaveProperty('event')
      expect(result).toHaveProperty('eventDate')
      expect(result).toHaveProperty('invitationLink')
      expect(result).toHaveProperty('qualifyingResults')
      expect(result).toHaveProperty('reg')
      expect(result).toHaveProperty('regDates')
      expect(result).toHaveProperty('reserveText')
      expect(result).toHaveProperty('groupDate')
      expect(result).toHaveProperty('groupTime')
      expect(result).toHaveProperty('groupNumber')
      expect(result).toHaveProperty('text')
      expect(result).toHaveProperty('origin')
      expect(result).toHaveProperty('cancelReason')
      expect(result).toHaveProperty('delayedPayment')

      // Check specific values that don't depend on the t function
      expect(result.link).toBe('https://example.com/r/event1/reg1')
      expect(result.paymentLink).toBe('https://example.com/p/event1/reg1')
      expect(result.invitationLink).toBe('https://example.com/r/event1/reg1/invitation')
      expect(result.event).toBe(confirmedEvent)
      expect(result.reg).toBe(registration)
      expect(result.text).toBe('Additional text')
      expect(result.origin).toBe('https://example.com')
      expect(result.groupNumber).toBe(5)
    })

    it('should use previous group when provided', () => {
      // Use type assertion to avoid TypeScript errors
      const registration = {
        eventId: 'event1',
        id: 'reg1',
        dog: { breedCode: '123' },
        dates: [],
        qualifyingResults: [],
        group: { date: '2024-08-01', time: 'ap', number: 5, key: 'group1' },
      } as any // Type assertion

      const previousGroup = { date: '2024-08-02', time: 'ip', number: 10, key: 'group2' }

      const result = getRegistrationEmailTemplateData(
        registration,
        {} as any, // Type assertion for empty event object
        'https://example.com',
        'confirmation' as any, // Type assertion for context
        '',
        t,
        previousGroup as any
      )

      // Verify that the previous group's number is used
      expect(result.groupNumber).toBe(10)
    })

    it('should handle missing data gracefully', () => {
      const registration = {
        eventId: 'event1',
        id: 'reg1',
        dog: {},
        dates: [],
        qualifyingResults: [],
        group: {},
      } as any

      // This should not throw an error
      const result = getRegistrationEmailTemplateData(
        registration,
        {} as any, // Type assertion for empty event object
        undefined,
        'confirmation' as any, // Type assertion for context
        undefined,
        t
      )

      // Verify some default values
      expect(result.groupNumber).toBe('?')
    })
  })

  describe('getNextClass', () => {
    it.each<[RegistrationClass | undefined, RegistrationClass | undefined]>([
      ['AVO', 'ALO'],
      ['VOI', 'AVO'],
      [undefined, 'VOI'],
      [undefined, undefined],
    ])('should return %p for %p', (expected, current) => {
      expect(getNextClass(current)).toEqual(expected)
    })
  })
})
