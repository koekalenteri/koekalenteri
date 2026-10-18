import type { JsonJudge } from '../../../types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.judgeTable)

/** Every judge the table holds; a deleted one is left out. */
export const readJudges = async (): Promise<JsonJudge[]> => (await dynamoDB.readAll<JsonJudge>()) ?? []

/** Stores the judge as given, replacing what the table held for it. */
export const writeJudge = async (judge: JsonJudge) => {
  await dynamoDB.write(judge)
}

/** Stores the judges as given, in batches. */
export const writeJudges = async (judges: JsonJudge[]) => {
  await dynamoDB.batchWrite(judges)
}
