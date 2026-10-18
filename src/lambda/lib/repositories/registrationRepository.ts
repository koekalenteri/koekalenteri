import type { JsonRegistration } from '../../../types'
import type { RegistrationStatsInput } from '../../../types/Stats'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

// Partial: only the reads the stats code needs. KOE-1409 moves the rest of the table here.
const dynamoDB = new CustomDynamoClient(CONFIG.registrationTable)

const REGISTRATION_STATS_PROJECTION_NAMES = {
  '#class': 'class',
  '#group': 'group',
  '#handler': 'handler',
  '#key': 'key',
  '#owner': 'owner',
}
const REGISTRATION_STATS_PROJECTION =
  'eventId, id, cancelled, paidAmount, refundAmount, eventType, dog.regNo, dog.breedCode, #handler.email, #handler.membership, #owner.membership, owners, ownerHandles, #class, #group.#key'

/** Every registration, with only the fields the stats rebuild counts from. */
export const readRegistrationsForStats = async (): Promise<RegistrationStatsInput[]> =>
  (await dynamoDB.readAll<RegistrationStatsInput>({
    names: REGISTRATION_STATS_PROJECTION_NAMES,
    projection: REGISTRATION_STATS_PROJECTION,
  })) ?? []

/** The registration as last written, or undefined when there is none. */
export const readRegistrationConsistently = async (eventId: string, id: string) =>
  dynamoDB.read<JsonRegistration>({ eventId, id }, undefined, true)
