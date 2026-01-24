import type { Registration, RegistrationGroup, RegistrationGroupInfo } from '../../../../types'
import type { DragItem } from './types'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../../../lib/registration'
import { determineChangesFromDrop } from './dnd'

describe('dnd', () => {
  describe('determineChangesFromDrop', () => {
    it.each<[number[], string, boolean, number, number | undefined, 'after' | 'before']>([
      [[], GROUP_KEY_CANCELLED, true, 0, 1, 'after'],
      [[], GROUP_KEY_CANCELLED, false, 0, 1, 'after'],

      [[], GROUP_KEY_RESERVE, false, 0, 0, 'after'],
      [[], GROUP_KEY_RESERVE, false, 0, 1, 'after'],
      [[], GROUP_KEY_RESERVE, false, 0, 2, 'after'],
      [[], GROUP_KEY_RESERVE, false, 0, 3, 'after'],
      [[], GROUP_KEY_RESERVE, false, 0, 4, 'after'],
      [[], GROUP_KEY_RESERVE, false, 2, 0, 'before'],
      [[], GROUP_KEY_RESERVE, false, 2, 1, 'before'],
      [[], GROUP_KEY_RESERVE, false, 2, 2, 'before'],
      [[], GROUP_KEY_RESERVE, false, 2, 3, 'before'],
      [[], GROUP_KEY_RESERVE, false, 2, 4, 'before'],

      // moving up
      [[0.5], GROUP_KEY_RESERVE, true, 1, 0, 'before'],
      [[1.5], GROUP_KEY_RESERVE, true, 1, 0, 'after'],

      [[0.5], GROUP_KEY_RESERVE, true, 2, 0, 'before'],
      [[1.5], GROUP_KEY_RESERVE, true, 2, 0, 'after'],

      [[1.5], GROUP_KEY_RESERVE, true, 2, 1, 'before'],
      [[2.5], GROUP_KEY_RESERVE, true, 2, 1, 'after'],

      // moving down
      [[1.5], GROUP_KEY_RESERVE, true, 0, 1, 'before'],
      [[2.5], GROUP_KEY_RESERVE, true, 0, 1, 'after'],

      [[2.5], GROUP_KEY_RESERVE, true, 0, 2, 'before'],
      [[3.5], GROUP_KEY_RESERVE, true, 0, 2, 'after'],

      [[2.5], GROUP_KEY_RESERVE, true, 1, 2, 'before'],
      [[3.5], GROUP_KEY_RESERVE, true, 1, 2, 'after'],

      // move after last item
      [[4.5], GROUP_KEY_RESERVE, true, 1, 3, 'after'],

      // no targetIndex
      [[1.5], GROUP_KEY_RESERVE, true, 1, undefined, 'after'],
    ])('should return %p when moving within %p group and canArrangeReserve=%p', (expecterNumbers, groupKey, canArrangeReserve, index, targetIndex, position) => {
      const item: DragItem = {
        groupKey,
        groups: [],
        id: 'reg-id',
        index,
        position,
        targetGroupKey: groupKey,
        targetIndex,
      }
      const group: RegistrationGroup = {
        key: groupKey,
        number: 0, // not important
      }
      const reg: Pick<Registration, 'eventId' | 'group' | 'id'> = {
        eventId: 'event-id',
        group: { key: groupKey, number: index + 1 },
        id: 'reg-id',
      }
      const regs: Pick<Registration, 'group'>[] = [
        { group: { key: groupKey, number: 1 } },
        { group: { key: groupKey, number: 2 } },
        { group: { key: groupKey, number: 3 } },
      ].filter((r) => r.group.number !== reg.group?.number)

      const expected = expecterNumbers.map<RegistrationGroupInfo>((number) => ({
        eventId: 'event-id',
        group: { key: groupKey, number },
        id: 'reg-id',
      }))

      expect(determineChangesFromDrop(item, group, reg, regs, canArrangeReserve)).toEqual(expected)
    })

    it.each<[number[], string, string, number, number, 'after' | 'before']>([
      [[4], GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE, 3, 0, 'before'],
      [[4], GROUP_KEY_RESERVE, GROUP_KEY_CANCELLED, 2, 1, 'after'],
      [[4], GROUP_KEY_RESERVE, 'participant group', 1, 2, 'before'],
      [[4], GROUP_KEY_CANCELLED, 'participant group', 0, 3, 'after'],
      [[4], 'grp1', 'grp2', 1, 2, 'before'],
      [[4], 'grp a', 'group b', 0, 3, 'after'],
    ])('should return %p when moving from group %p to %p', (expecterNumbers, groupKey, targetGroupKey, index, targetIndex, position) => {
      const item: DragItem = {
        groupKey,
        groups: [],
        id: 'reg-id',
        index,
        position,
        targetGroupKey,
        targetIndex,
      }
      const group: RegistrationGroup = {
        key: targetGroupKey,
        number: 0, // not important
      }
      const reg: Pick<Registration, 'eventId' | 'group' | 'id'> = {
        eventId: 'event-id',
        group: { key: groupKey, number: index + 1 },
        id: 'reg-id',
      }
      const regs: Pick<Registration, 'group'>[] = [
        { group: { key: targetGroupKey, number: 1 } },
        { group: { key: targetGroupKey, number: 2 } },
        { group: { key: targetGroupKey, number: 3 } },
      ]

      const expected = expecterNumbers.map<RegistrationGroupInfo>((number) => ({
        cancelled: targetGroupKey === GROUP_KEY_CANCELLED,
        eventId: 'event-id',
        group: { key: targetGroupKey, number },
        id: 'reg-id',
      }))

      expect(determineChangesFromDrop(item, group, reg, regs, false)).toEqual(expected)
      expect(determineChangesFromDrop(item, group, reg, regs, true)).toEqual(expected)
    })
  })
})
