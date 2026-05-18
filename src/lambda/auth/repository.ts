import type { JsonUser } from '../../types'
import type { UserLink } from './api'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const db = new CustomDynamoClient(CONFIG.userLinkTable)

export const authRepository = {
  readUserById(userId: string) {
    return db.read<JsonUser>({ id: userId }, CONFIG.userTable)
  },
  readUserLink(cognitoUser: string) {
    return db.read<UserLink>({ cognitoUser })
  },
  writeUserLink(link: UserLink) {
    return db.write(link, CONFIG.userLinkTable)
  },
}
