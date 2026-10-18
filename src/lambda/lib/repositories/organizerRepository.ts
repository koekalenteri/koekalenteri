import type { Organizer } from '../../../types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.organizerTable)

/** What an admin saves of an organizer: its id and the fields that change. */
type OrganizerChanges = Partial<Organizer> & Pick<Organizer, 'id'>

/** Every organizer the table holds. */
export const readOrganizers = async (): Promise<Organizer[]> => (await dynamoDB.readAll<Organizer>()) ?? []

/** The organizer by its id, or undefined for one the table does not hold. */
export const readOrganizer = async (id: string) => dynamoDB.read<Organizer>({ id })

/** Stores the changes over what the table holds for the organizer, and returns the row as stored. */
export const saveOrganizer = async (changes: OrganizerChanges) => {
  const existing = await readOrganizer(changes.id)
  const updated = { ...existing, ...changes }
  await dynamoDB.write(updated)
  return updated
}

/** Takes the name the Kennel Club now reports for the organizer. */
export const renameOrganizer = async (id: string, name: string) => {
  await dynamoDB.update({ id }, { set: { name } })
}

/** Stores organizers the Kennel Club reports and the table does not hold yet. */
export const addOrganizers = async (organizers: Organizer[]) => {
  await dynamoDB.batchWrite(organizers)
}
