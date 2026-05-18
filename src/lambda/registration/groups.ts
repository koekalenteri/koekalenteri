import type { JsonRegistration, JsonRegistrationGroupInfo, JsonUser } from '../../types'
import { formatDate } from '../../i18n/dates'
import {
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  getRegistrationGroupKey,
  getRegistrationNumberingGroupKey,
  sortRegistrationsByDateClassTimeAndNumber,
} from '../../lib/registration'
import { isDefined } from '../../lib/typeGuards'
import { audit, registrationAuditKey } from '../lib/audit'
import { registrationRepository } from './repository'

export const formatGroupAuditInfo = (group: JsonRegistrationGroupInfo['group']): string => {
  if (!group) return ''

  if (group.key === GROUP_KEY_CANCELLED) return `Peruneet #${group.number}`
  if (group.key === GROUP_KEY_RESERVE) return `Ilmoittautuneet #${group.number}`

  const groupKey = [group.date && formatDate(group.date, 'eee d.M.'), group.time].filter(isDefined).join(' ')

  return `${groupKey} #${group.number}`
}

export const saveGroup = async (
  { eventId, id, group }: JsonRegistrationGroupInfo,
  previous: JsonRegistrationGroupInfo['group'],
  user: JsonUser,
  reason: string = '',
  cancelReason?: string
) => {
  const registrationKey = { eventId, id }
  const cancelled = group?.key === GROUP_KEY_CANCELLED
  await registrationRepository.patchGroup(eventId, id, {
    cancelled,
    ...(cancelled && cancelReason ? { cancelReason } : {}),
    group,
  })
  const oldGroupInfo = previous ? `${formatGroupAuditInfo(previous)} -> ` : ''
  await audit({
    auditKey: registrationAuditKey(registrationKey),
    message: `Ryhmä: ${oldGroupInfo}${formatGroupAuditInfo(group)} ${reason}`.trim(),
    user: user.name,
  })
}

export const fixRegistrationGroups = async <T extends JsonRegistration>(
  items: T[],
  user: JsonUser,
  save: boolean = true
): Promise<T[]> => {
  items.sort(sortRegistrationsByDateClassTimeAndNumber)

  const numberingGroups: Record<string, T[]> = {}
  for (const item of items) {
    const numberingGroupKey = getRegistrationNumberingGroupKey(item)
    numberingGroups[numberingGroupKey] = numberingGroups[numberingGroupKey] || []
    numberingGroups[numberingGroupKey].push(item)
  }

  for (const regs of Object.values(numberingGroups)) {
    for (let i = 0; i < regs.length; i++) {
      const reg = regs[i]
      const key = getRegistrationGroupKey(reg)
      const number = i + 1
      if (reg.group?.key !== key || reg.group?.number !== number) {
        const oldGroup = reg.group
        reg.group = { ...reg.group, key, number }
        if (save) {
          await saveGroup(reg, oldGroup, user, '(automaattinen sijoitus)')
        }
      }
    }
  }

  return items
}
