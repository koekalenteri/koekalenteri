import type { JsonEmailSuppression } from '../../../types'
import { CONFIG } from '../../config'
import CustomDynamoClient from '../../utils/CustomDynamoClient'

const dynamoDB = new CustomDynamoClient(CONFIG.emailSuppressionTable)

/** The suppression stored for the address, or undefined for an address that has not bounced. */
export const readEmailSuppression = async (email: string) => dynamoDB.read<JsonEmailSuppression>({ email })

/** Stores the suppression, replacing what the table held for its address. */
export const writeEmailSuppression = async (suppression: JsonEmailSuppression) => {
  await dynamoDB.write(suppression)
}
