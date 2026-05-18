import type { AuditRecord, JsonRegistration } from '../../types'
import { auditRepository } from '../audit/repository'

export const registrationAuditKey = (reg: Pick<JsonRegistration, 'eventId' | 'id'>) => `${reg.eventId}:${reg.id}`

export const audit = async (item: Omit<AuditRecord, 'timestamp'>) => {
  try {
    await auditRepository.create(item)
  } catch (e) {
    console.error(e)
  }
}

export const auditTrail = async (auditKey: string) => {
  try {
    return (await auditRepository.listByAuditKey(auditKey)) ?? []
  } catch (e) {
    console.error(e)
  }
  return []
}
