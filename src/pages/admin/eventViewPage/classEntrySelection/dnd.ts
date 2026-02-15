import type { Registration, RegistrationGroup, RegistrationGroupInfo } from '../../../../types'
import type { DragItem } from './types'

import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../../../lib/registration'

export const determineChangesFromDrop = (
  item: DragItem,
  targetGroup: RegistrationGroup,
  reg: Pick<Registration, 'eventId' | 'group' | 'id'>,
  regs: Pick<Registration, 'group'>[],
  canArrangeReserve: boolean
): RegistrationGroupInfo[] => {
  // by default, assume new location is last in group
  const newGroup = { ...targetGroup, number: regs.length + 1 }

  if (item.groupKey !== newGroup.key) {
    // move from list to another (always last)
    return [{ eventId: reg.eventId, id: reg.id, group: newGroup, cancelled: newGroup.key === GROUP_KEY_CANCELLED }]
  }

  if (targetGroup.key === GROUP_KEY_CANCELLED || (targetGroup.key === GROUP_KEY_RESERVE && !canArrangeReserve)) {
    // user can not re-order items in cancelled or reserve groups
    delete item.targetGroupKey
    return []
  }

  if (item.targetGroupKey && item.targetGroupKey === item.groupKey) {
    const targetIndex = item.targetIndex ?? 0
    // if moving down, substract 1 (bevause this reg is not included in regs)
    const directionModifier = item.index < targetIndex ? -1 : 0
    // modifier based on if hovered above or below the target
    const hoverModifier = item.position === 'before' ? -0.5 : 0.5
    // final position
    const pos = targetIndex + directionModifier
    // take the number from registration in that position
    newGroup.number = regs[pos]?.group?.number ?? 0

    // moved as last, set number to last + 1
    if (item.position === 'after' && pos > 0 && newGroup.number === 0) {
      newGroup.number = (regs.at(-1)?.group?.number ?? 0) + 1
    }

    // apply 0.5 modifier based on position. backend will fix the numbers.
    return [
      {
        eventId: reg.eventId,
        id: reg.id,
        group: { ...newGroup, number: newGroup.number + hoverModifier },
      },
    ]
  }

  return []
}
