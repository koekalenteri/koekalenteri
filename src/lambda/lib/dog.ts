import type { JsonDog, JsonTestResult } from '../../types'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.dogTable)

/**
 * The dog's official results as the Kennel Club last reported them, from the dog table the lookup
 * fills. A registration request carries a copy of these too, but a copy the client wrote is not
 * one the eligibility can rest on (KOE-1346); a dog the lookup never found has none.
 */
export const readOfficialResults = async (regNo: string): Promise<JsonTestResult[]> =>
  (await dynamoDB.read<JsonDog>({ regNo }))?.results ?? []
