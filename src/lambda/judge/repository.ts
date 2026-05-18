import type { JsonJudge } from '../../types'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

type JudgeRepositoryDependencies = {
  db: Pick<CustomDynamoClient, 'batchWrite' | 'readAll' | 'write'>
}

export interface JudgeRepository {
  list(): Promise<JsonJudge[] | undefined>
  batchWrite(items: JsonJudge[]): Promise<void>
  write(item: JsonJudge): Promise<void>
}

export const createJudgeRepository = ({ db }: JudgeRepositoryDependencies): JudgeRepository => ({
  async batchWrite(items) {
    await db.batchWrite(items, CONFIG.judgeTable)
  },
  async list() {
    return db.readAll<JsonJudge>(CONFIG.judgeTable)
  },
  async write(item) {
    await db.write(item, CONFIG.judgeTable)
  },
})

const dynamoDB = new CustomDynamoClient(CONFIG.judgeTable)
export const judgeRepository = createJudgeRepository({ db: dynamoDB })
