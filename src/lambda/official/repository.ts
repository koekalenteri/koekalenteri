import type { JsonOfficial } from '../../types'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

type OfficialRepositoryDependencies = {
  db: Pick<CustomDynamoClient, 'batchWrite' | 'readAll' | 'write'>
}

export interface OfficialRepository {
  list(): Promise<JsonOfficial[] | undefined>
  batchWrite(items: JsonOfficial[]): Promise<void>
  write(item: JsonOfficial): Promise<void>
}

export const createOfficialRepository = ({ db }: OfficialRepositoryDependencies): OfficialRepository => ({
  async batchWrite(items) {
    await db.batchWrite(items, CONFIG.officialTable)
  },
  async list() {
    return db.readAll<JsonOfficial>(CONFIG.officialTable)
  },
  async write(item) {
    await db.write(item, CONFIG.officialTable)
  },
})

const dynamoDB = new CustomDynamoClient(CONFIG.officialTable)
export const officialRepository = createOfficialRepository({ db: dynamoDB })
