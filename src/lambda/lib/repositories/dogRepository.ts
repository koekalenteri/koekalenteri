import type { JsonDog, JsonTestResult } from '../../../types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.dogTable)

/** The dog as the Kennel Club lookup last stored it, or undefined for a dog it never found. */
export const readDog = async (regNo: string) => dynamoDB.read<JsonDog>({ regNo })

/** Stores the dog the Kennel Club lookup returned, replacing what the table held for it. */
export const writeDog = async (dog: JsonDog) => {
  await dynamoDB.write(dog)
}

/** Forgets a dog the Kennel Club reports deceased. */
export const deleteDog = async (regNo: string) => {
  await dynamoDB.delete({ regNo })
}

/**
 * The dog's official results as the Kennel Club last reported them, from the dog table the lookup
 * fills. A registration request carries a copy of these too, but a copy the client wrote is not
 * one the eligibility can rest on (KOE-1346); a dog the lookup never found has none.
 */
export const readOfficialResults = async (regNo: string): Promise<JsonTestResult[]> =>
  (await readDog(regNo))?.results ?? []
