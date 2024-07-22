import type { SortableRegistration } from './registration'

import { PRIORITY_INVITED, PRIORITY_MEMBER, PRIORIZED_BREED_CODES } from './priority'
import {
  canRefund,
  getRegistrationGroupKey,
  getRegistrationNumberingGroupKey,
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  hasPriority,
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
        expect(hasPriority({ priority: PRIORIZED_BREED_CODES }, { dog: { breedCode } })).toEqual(true)

        expect(hasPriority({ priority: [breedCode] }, { dog: { breedCode: '1' } })).toEqual(false)
        expect(hasPriority({ priority: [breedCode] }, {})).toEqual(false)
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
})
