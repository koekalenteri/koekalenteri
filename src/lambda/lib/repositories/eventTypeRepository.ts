import type { JsonEventType } from '../../../types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.eventTypeTable)

type EventTypeDescriptionChange = Pick<JsonEventType, 'description' | 'modifiedAt' | 'modifiedBy'>

/** Every event type the table holds, active or not; a deleted one is left out. */
export const readEventTypes = async (): Promise<JsonEventType[]> => (await dynamoDB.readAll<JsonEventType>()) ?? []

/** One event type by its code (`NOME-B`), or undefined for a code the table does not know. */
export const readEventType = async (eventType: string) => dynamoDB.read<JsonEventType>({ eventType })

/** Stores the event type as given, replacing what the table held for its code. */
export const writeEventType = async (eventType: JsonEventType) => {
  await dynamoDB.write(eventType)
}

/** Stores the event types as given, in batches. */
export const writeEventTypes = async (eventTypes: JsonEventType[]) => {
  await dynamoDB.batchWrite(eventTypes)
}

/**
 * Sets the description the Kennel Club gives an event type, leaving the fields an admin sets (such
 * as `active`) as they are.
 */
export const updateEventTypeDescription = async (eventType: string, change: EventTypeDescriptionChange) => {
  await dynamoDB.update(
    { eventType },
    {
      set: {
        description: change.description,
        modifiedAt: change.modifiedAt,
        modifiedBy: change.modifiedBy,
      },
    }
  )
}
