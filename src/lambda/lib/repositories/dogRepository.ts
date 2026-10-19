import type { JsonDog, JsonTestResult } from '../../../types'
import type { UpdateActions } from '../../utils/CustomDynamoClient'
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

/** Every dog in the table, for a data migration. */
export const readAllDogs = async (): Promise<JsonDog[]> =>
  (await dynamoDB.readAll<JsonDog>({ includeDeleted: true })) ?? []

/** The condition that a field still holds the value read, or is still absent when it was. */
const stillAsRead = (name: string, placeholder: string, read: unknown) =>
  read === undefined ? `attribute_not_exists(${name})` : `${name} = ${placeholder}`

/**
 * Writes a migration's changes to the dog's birth date and results, on condition that the row still
 * exists and both still hold what was read. A dog row has no `updatedAt`: the Kennel Club lookup
 * replaces the whole row, so a lookup in between changes the values the condition reads. Throws the
 * condition failure otherwise.
 */
export const writeMigratedDog = async (read: Pick<JsonDog, 'dob' | 'regNo' | 'results'>, changes: UpdateActions) => {
  const values: Record<string, unknown> = {}
  if (read.dob !== undefined) values[':readDob'] = read.dob
  if (read.results !== undefined) values[':readResults'] = read.results
  await dynamoDB.update({ regNo: read.regNo }, changes, undefined, undefined, {
    expression: [
      'attribute_exists(#regNo)',
      stillAsRead('#dob', ':readDob', read.dob),
      stillAsRead('#results', ':readResults', read.results),
    ].join(' AND '),
    names: { '#dob': 'dob', '#regNo': 'regNo', '#results': 'results' },
    ...(Object.keys(values).length ? { values } : {}),
  })
}
