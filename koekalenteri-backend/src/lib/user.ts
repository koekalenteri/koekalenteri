import { User } from 'koekalenteri-shared/model'

import CustomDynamoClient from '../utils/CustomDynamoClient'

const USER_LINK_TABLE = process.env.USER_LINK_TABLE_NAME
const USER_TABLE = process.env.USER_TABLE_NAME

const dynamoDB = new CustomDynamoClient(USER_LINK_TABLE)

let cache: User[] | undefined

export async function getAllUsers() {
  if (!cache) {
    cache = await dynamoDB.readAll<User>(USER_TABLE)
  }
  return cache
}

export async function findUserByEmail(email: string) {
  const users = await getAllUsers()

  return users?.find((user) => user.email === email)
}

export async function updateUser(user: User) {
  await dynamoDB.write(user, USER_TABLE)

  if (cache) {
    const idx = cache?.findIndex((u) => u.id === user.id)
    if (idx >= 0) {
      cache[idx] = user
    } else {
      cache.push(user)
    }
  }
}
