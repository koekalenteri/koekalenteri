import type { JsonDog } from '../../types'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

type DogRepositoryDependencies = {
  db: Pick<CustomDynamoClient, 'delete' | 'read' | 'write'>
}

export interface DogRepository {
  deleteByRegNo(regNo: string): Promise<boolean>
  readByRegNo(regNo: string): Promise<JsonDog | undefined>
  write(dog: JsonDog): Promise<void>
}

export const createDogRepository = ({ db }: DogRepositoryDependencies): DogRepository => ({
  async deleteByRegNo(regNo) {
    return db.delete({ regNo })
  },

  async readByRegNo(regNo) {
    return db.read<JsonDog>({ regNo })
  },

  async write(dog) {
    await db.write(dog)
  },
})

const dynamoDB = new CustomDynamoClient(CONFIG.dogTable)
export const dogRepository = createDogRepository({ db: dynamoDB })
