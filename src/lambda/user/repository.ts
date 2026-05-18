import type { JsonUser } from '../../types'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

type UserRepositoryDependencies = {
  db: Pick<CustomDynamoClient, 'batchWrite' | 'readAll'>
}

interface UserRepository {
  list(): Promise<JsonUser[] | undefined>
  batchWrite(items: JsonUser[]): Promise<void>
}

const createUserRepository = ({ db }: UserRepositoryDependencies): UserRepository => ({
  async batchWrite(items) {
    await db.batchWrite(items, CONFIG.userTable)
  },
  async list() {
    return db.readAll<JsonUser>(CONFIG.userTable)
  },
})

const dynamoDB = new CustomDynamoClient(CONFIG.userTable)
export const userRepository = createUserRepository({ db: dynamoDB })
