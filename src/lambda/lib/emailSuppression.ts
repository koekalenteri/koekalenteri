import type { JsonEmailSuppression, JsonRegistration, Patch } from '../../types'
import { getRegistrationOwners } from '../../lib/registration'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'
import { normalizeEmail } from './email'
import { LambdaError } from './lambda'

const dynamoDB = new CustomDynamoClient(CONFIG.emailSuppressionTable)

const getRegistrationEmails = (registration: JsonRegistration) =>
  Array.from(
    new Set(
      [
        ...getRegistrationOwners(registration).map((owner) => owner?.email),
        registration.handler?.email,
        registration.payer?.email,
      ]
        .filter((email): email is string => !!email)
        .map(normalizeEmail)
    )
  )

/** Shallow-clones the person-shaped fields so normalization cannot mutate the caller's objects. */
export const cloneRegistrationPeople = <T extends Patch<JsonRegistration>>(registration: T): T => ({
  ...registration,
  ...(registration.handler ? { handler: { ...registration.handler } } : {}),
  ...(registration.owner ? { owner: { ...registration.owner } } : {}),
  ...(registration.owners ? { owners: registration.owners.map((owner) => ({ ...owner })) } : {}),
  ...(registration.payer ? { payer: { ...registration.payer } } : {}),
})

export const normalizeRegistrationEmails = <T extends Patch<JsonRegistration>>(registration: T): T => {
  if (registration.owner?.email) {
    registration.owner.email = normalizeEmail(registration.owner.email)
  }
  for (const owner of registration.owners ?? []) {
    if (owner?.email) owner.email = normalizeEmail(owner.email)
  }
  if (registration.handler?.email) {
    registration.handler.email = normalizeEmail(registration.handler.email)
  }
  if (registration.payer?.email) {
    registration.payer.email = normalizeEmail(registration.payer.email)
  }

  return registration
}

export const shouldClearRegistrationEmailDeliveryStatus = (
  existing: JsonRegistration | undefined,
  registration: JsonRegistration
) => {
  const failedEmail = existing?.emailDeliveryStatus?.email
  if (!failedEmail) return false

  return !getRegistrationEmails(registration).includes(normalizeEmail(failedEmail))
}

const findEmailSuppressions = async (emails: string[]) => {
  const suppressions = await Promise.all(emails.map((email) => dynamoDB.read<JsonEmailSuppression>({ email })))

  return suppressions.filter((suppression): suppression is JsonEmailSuppression => !!suppression)
}

/**
 * The addresses this save puts on the registration that were not already on it.
 *
 * An address only reaches the suppression list after a message to it has already bounced, so a
 * stored one cannot be rejected without trapping the participant (KOE-1381): confirming a place or
 * reading the invitation changes no contact information at all, and a co-owner's address is not
 * something those views even show. Checking only what the save introduces still stops a bad address
 * exactly where it is typed — on the registration form, where it can be corrected.
 */
const getAddedRegistrationEmails = (registration: JsonRegistration, existing?: JsonRegistration) => {
  const emails = getRegistrationEmails(registration)
  if (!existing) return emails

  const stored = new Set(getRegistrationEmails(existing))
  return emails.filter((email) => !stored.has(email))
}

export const assertRegistrationEmailsNotSuppressed = async (
  registration: JsonRegistration,
  existing?: JsonRegistration
) => {
  const suppressions = await findEmailSuppressions(getAddedRegistrationEmails(registration, existing))
  const suppression = suppressions[0]

  if (suppression) {
    throw new LambdaError(
      409,
      JSON.stringify({ email: suppression.email, error: 'emailSuppressed', reason: suppression.reason })
    )
  }
}
