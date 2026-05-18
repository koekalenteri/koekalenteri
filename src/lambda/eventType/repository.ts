import type { JsonEventType } from '../../types'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

type EventTypeRepositoryDependencies = {
  db: Pick<CustomDynamoClient, 'batchWrite' | 'readAll' | 'update' | 'write'>
}

interface EventTypeRepository {
  list(): Promise<JsonEventType[] | undefined>
  write(item: JsonEventType): Promise<void>
  batchWrite(items: JsonEventType[]): Promise<void>
  updateDescription(input: {
    eventType: string
    description: JsonEventType['description']
    modifiedAt: string
    modifiedBy: string
  }): Promise<void>
}

const createEventTypeRepository = ({ db }: EventTypeRepositoryDependencies): EventTypeRepository => ({
  async batchWrite(items) {
    await db.batchWrite(items)
  },
  async list() {
    return db.readAll<JsonEventType>()
  },
  async updateDescription({ eventType, description, modifiedAt, modifiedBy }) {
    await db.update({ eventType }, { set: { description, modifiedAt, modifiedBy } })
  },
  async write(item) {
    await db.write(item)
  },
})

const dynamoDB = new CustomDynamoClient(CONFIG.eventTypeTable)
export const eventTypeRepository = createEventTypeRepository({ db: dynamoDB })
