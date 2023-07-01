import { JsonAuditRecord } from 'koekalenteri-shared/model'

import CustomDynamoClient from '../utils/CustomDynamoClient'

const AUDIT_TABLE = process.env.AUDIT_TABLE_NAME

const dynamoDB = new CustomDynamoClient(AUDIT_TABLE)

export const audit = async (auditKey: string, message: string) => {
  try {
    dynamoDB.write({ auditKey, timestamp: new Date().toISOString(), message })
  } catch (e) {
    console.error(e)
  }
}

export const auditTrail = async (auditKey: string) => {
  try {
    const items = await dynamoDB.query<JsonAuditRecord>('auditKey = :auditKey', {
      ':auditKey': auditKey,
    })
    return items ?? []
  } catch (e) {
    console.error(e)
  }
  return []
}
