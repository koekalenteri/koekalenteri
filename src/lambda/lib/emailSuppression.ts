import type { JsonEmailSuppression, JsonRegistration } from '../../types'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { normalizeEmail } from './email'
import { LambdaError } from './lambda'

const dynamoDB = new CustomDynamoClient(CONFIG.emailSuppressionTable)

const getRegistrationEmails = (registration: JsonRegistration) =>
  Array.from(
    new Set(
      [registration.owner?.email, registration.handler?.email, registration.payer?.email]
        .filter((email): email is string => !!email)
        .map(normalizeEmail)
    )
  )

export const normalizeRegistrationEmails = (registration: JsonRegistration) => {
  if (registration.owner?.email) {
    registration.owner.email = normalizeEmail(registration.owner.email)
  }
  if (registration.handler?.email) {
    registration.handler.email = normalizeEmail(registration.handler.email)
  }
  if (registration.payer?.email) {
    registration.payer.email = normalizeEmail(registration.payer.email)
  }

  return registration
}

const findRegistrationEmailSuppressions = async (registration: JsonRegistration) => {
  const emails = getRegistrationEmails(registration)
  const suppressions = await Promise.all(emails.map((email) => dynamoDB.read<JsonEmailSuppression>({ email })))

  return suppressions.filter((suppression): suppression is JsonEmailSuppression => !!suppression)
}

export const assertRegistrationEmailsNotSuppressed = async (registration: JsonRegistration) => {
  const suppressions = await findRegistrationEmailSuppressions(registration)
  const suppression = suppressions[0]

  if (suppression) {
    throw new LambdaError(
      409,
      JSON.stringify({ email: suppression.email, error: 'emailSuppressed', reason: suppression.reason })
    )
  }
}
