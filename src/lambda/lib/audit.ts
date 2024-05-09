import type { AuditRecord, JsonAuditRecord, JsonRegistration } from '../../types'

import { formatMoney } from '../../lib/money'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { auditTable } = CONFIG
const dynamoDB = new CustomDynamoClient(auditTable)

export const registrationAuditKey = (reg: JsonRegistration) => `${reg.eventId}:${reg.id}`

export const audit = async (item: Omit<AuditRecord, 'timestamp'>) => {
  try {
    dynamoDB.write({ ...item, timestamp: new Date().toISOString() }, auditTable)
  } catch (e) {
    console.error(e)
  }
}

export const auditRefund = (
  registration: JsonRegistration,
  provider: string | undefined,
  amount: number,
  user: string
) => {
  audit({
    auditKey: registrationAuditKey(registration),
    message: `Palautus (${provider}), ${formatMoney(amount / 100)}`,
    user,
  })
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
