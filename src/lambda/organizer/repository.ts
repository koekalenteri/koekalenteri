import type { Organizer } from '../../types'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

type OrganizerRepositoryDependencies = {
  db: Pick<CustomDynamoClient, 'batchWrite' | 'read' | 'readAll' | 'update' | 'write'>
}

interface OrganizerRepository {
  batchWrite(items: Organizer[]): Promise<void>
  getById(id: string): Promise<Organizer | undefined>
  list(): Promise<Organizer[] | undefined>
  updateName(id: string, name: string): Promise<void>
  write(item: Organizer): Promise<void>
}

const createOrganizerRepository = ({ db }: OrganizerRepositoryDependencies): OrganizerRepository => ({
  async batchWrite(items) {
    await db.batchWrite(items)
  },

  async getById(id) {
    return db.read<Organizer>({ id })
  },

  async list() {
    return db.readAll<Organizer>()
  },

  async updateName(id, name) {
    await db.update(
      { id },
      {
        set: {
          name,
        },
      }
    )
  },

  async write(item) {
    await db.write(item)
  },
})

const dynamoDB = new CustomDynamoClient(CONFIG.organizerTable)
export const organizerRepository = createOrganizerRepository({ db: dynamoDB })
