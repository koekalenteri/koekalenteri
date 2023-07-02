import { AuditRecord, JsonAuditRecord, JsonRegistration } from 'koekalenteri-shared/model'

import CustomDynamoClient from '../utils/CustomDynamoClient'

const AUDIT_TABLE = process.env.AUDIT_TABLE_NAME

const dynamoDB = new CustomDynamoClient(AUDIT_TABLE)

export const audit = async (item: Omit<AuditRecord, 'timestamp'>) => {
  try {
    dynamoDB.write({ ...item, timestamp: new Date().toISOString() }, AUDIT_TABLE)
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
      AUDIT_TABLE
    )
    return items ?? []
  } catch (e) {
    console.error(e)
  }
  return []
}

export const registrationAuditKey = (reg: JsonRegistration) => `${reg.eventId}:${reg.id}`
