import type { AuditRecord, JsonAuditRecord } from '../../types'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

type AuditRepositoryDependencies = {
  db: Pick<CustomDynamoClient, 'query' | 'write'>
}

interface AuditRepository {
  create(item: Omit<AuditRecord, 'timestamp'>): Promise<void>
  listByAuditKey(auditKey: string): Promise<JsonAuditRecord[]>
}

const createAuditRepository = ({ db }: AuditRepositoryDependencies): AuditRepository => ({
  async create(item) {
    await db.write({ ...item, timestamp: new Date().toISOString() }, CONFIG.auditTable)
  },

  async listByAuditKey(auditKey) {
    const items = await db.query<JsonAuditRecord>({
      key: 'auditKey = :auditKey',
      table: CONFIG.auditTable,
      values: { ':auditKey': auditKey },
    })
    return items ?? []
  },
})

const dynamoDB = new CustomDynamoClient(CONFIG.auditTable)
export const auditRepository = createAuditRepository({ db: dynamoDB })
