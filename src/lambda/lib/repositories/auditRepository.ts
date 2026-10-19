import type { JsonAuditRecord } from '../../../types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.auditTable)

/** Stores one audit record; `auditKey` + `timestamp` is its key, so the same pair overwrites it. */
export const writeAuditRecord = async (record: JsonAuditRecord) => {
  await dynamoDB.write(record)
}

/** Every audit record under the key: an event's (`event:<id>`) or a registration's (`<eventId>:<id>`). */
export const readAuditTrail = async (auditKey: string): Promise<JsonAuditRecord[]> =>
  (await dynamoDB.query<JsonAuditRecord>({
    key: 'auditKey = :auditKey',
    values: { ':auditKey': auditKey },
  })) ?? []
