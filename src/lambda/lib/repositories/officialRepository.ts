import type { JsonOfficial } from '../../../types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.officialTable)

/** Every trial official the table holds; a deleted one is left out. */
export const readOfficials = async (): Promise<JsonOfficial[]> => (await dynamoDB.readAll<JsonOfficial>()) ?? []

/** Stores the officials as given, in batches. */
export const writeOfficials = async (officials: JsonOfficial[]) => {
  await dynamoDB.batchWrite(officials)
}
