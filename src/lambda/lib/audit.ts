import type { AuditRecord, JsonAuditRecord, JsonRegistration } from '../../types'

import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { auditTable } = CONFIG
const dynamoDB = new CustomDynamoClient(auditTable)

export const registrationAuditKey = (reg: Pick<JsonRegistration, 'eventId' | 'id'>) => `${reg.eventId}:${reg.id}`

export const audit = async (item: Omit<AuditRecord, 'timestamp'>) => {
  try {
    dynamoDB.write({ ...item, timestamp: new Date().toISOString() }, auditTable)
  } catch (e) {
    console.error(e)
  }
}

export const auditTrail = async (auditKey: string) => {
  try {
    const items = await dynamoDB.query<JsonAuditRecord>(
      'auditKey = :auditKey',
      {
        ':auditKey': auditKey,
      },
      auditTable
    )
    return items ?? []
  } catch (e) {
    console.error(e)
  }
  return []
}
