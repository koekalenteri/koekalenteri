import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

/** A Cognito identity and the user record it logs in as. */
export interface UserLink {
  cognitoUser: string
  userId: string
}

const dynamoDB = new CustomDynamoClient(CONFIG.userLinkTable)

/** The link of this Cognito identity, or undefined when it has not been linked to a user yet. */
export const readUserLink = async (cognitoUser: string): Promise<UserLink | undefined> =>
  dynamoDB.read<UserLink>({ cognitoUser })

/** Links the Cognito identity to the user, replacing a link it had. */
export const writeUserLink = async (link: UserLink) => {
  await dynamoDB.write(link)
}

/** Every link the table holds. A full scan, kept on purpose for the judge and official sync (KOE-1341). */
export const readAllUserLinks = async (): Promise<UserLink[]> => (await dynamoDB.readAll<UserLink>()) ?? []
