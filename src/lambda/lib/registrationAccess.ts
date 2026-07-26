import type { APIGatewayProxyEvent } from 'aws-lambda'
import type { JsonRegistration, Patch } from '../../types'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { LambdaError } from './lambda'
import { removeRegistrationCreationMetadata } from './registrationMetadata'
import { getRegistrationEditTokenSecret } from './secrets'

export const DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION = 1

export const deriveRegistrationEditToken = (
  registration: Pick<JsonRegistration, 'editTokenVersion' | 'eventId' | 'id'>,
  secret: string
): string =>
  createHmac('sha256', secret)
    .update(
      `registration-edit:${registration.eventId}:${registration.id}:${registration.editTokenVersion ?? DEFAULT_REGISTRATION_EDIT_TOKEN_VERSION}`
    )
    .digest('base64url')

export const getRegistrationEditToken = async (
  registration: Pick<JsonRegistration, 'editTokenVersion' | 'eventId' | 'id'>
): Promise<string> => deriveRegistrationEditToken(registration, await getRegistrationEditTokenSecret())

const getBearerToken = (event: Pick<APIGatewayProxyEvent, 'headers'>): string => {
  const authorization = event.headers.Authorization ?? event.headers.authorization ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(authorization)
  return match?.[1] ?? ''
}

const tokensMatch = (actual: string, expected: string): boolean => {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer)
}

export const authorizeRegistrationEdit = async (
  event: Pick<APIGatewayProxyEvent, 'headers'>,
  registration: Pick<JsonRegistration, 'editTokenVersion' | 'eventId' | 'id'>
): Promise<string> => {
  const token = getBearerToken(event)
  if (!token) throw new LambdaError(404, 'not found')

  const expected = await getRegistrationEditToken(registration)
  if (!tokensMatch(token, expected)) throw new LambdaError(404, 'not found')
  return token
}

export const authorizeRegistrationRead = async (
  event: Pick<APIGatewayProxyEvent, 'headers'>,
  registration: Pick<JsonRegistration, 'editTokenVersion' | 'eventId' | 'id'>
): Promise<string> => {
  const token = getBearerToken(event)

  // Registrations created before edit tokens were introduced have links containing
  // only the registration ID. Keep those links readable, but never extend this
  // compatibility path to token-versioned registrations.
  if (!token && registration.editTokenVersion === undefined) return getRegistrationEditToken(registration)

  return authorizeRegistrationEdit(event, registration)
}

const PUBLIC_REGISTRATION_FIELDS: ReadonlyArray<keyof JsonRegistration> = [
  'agreeToTerms',
  'breeder',
  'cancelReason',
  'cancelled',
  'class',
  'creationIdempotencyKey',
  'dates',
  'dog',
  'eventId',
  'eventType',
  'confirmed',
  'handler',
  'invitationRead',
  'language',
  'notes',
  'optionalCosts',
  'owner',
  'ownerHandles',
  'ownerPays',
  'payer',
  'reserve',
  'results',
  'selectedCost',
]

const PUBLIC_UPDATE_FIELDS = new Set<keyof JsonRegistration>([...PUBLIC_REGISTRATION_FIELDS, 'id'])

// The event type is fixed when the registration is created.
PUBLIC_UPDATE_FIELDS.delete('eventType')
// The idempotency secret is immutable once a registration exists.
PUBLIC_UPDATE_FIELDS.delete('creationIdempotencyKey')

export const publicRegistrationPatch = (input: Patch<JsonRegistration>, update: boolean): Patch<JsonRegistration> => {
  const result: Patch<JsonRegistration> = {}
  const fields: ReadonlyArray<keyof JsonRegistration> = update ? [...PUBLIC_UPDATE_FIELDS] : PUBLIC_REGISTRATION_FIELDS
  for (const field of fields) {
    if (Object.hasOwn(input, field)) Object.assign(result, { [field]: input[field] })
  }

  if (!update) {
    delete result.cancelReason
    delete result.cancelled
    delete result.confirmed
    delete result.invitationRead
  } else {
    // Participant workflow flags are one-way transitions. Clearing them is organizer-only.
    if (result.cancelled !== true) {
      delete result.cancelled
      delete result.cancelReason
    }
    if (result.confirmed !== true) delete result.confirmed
    if (result.invitationRead !== true) delete result.invitationRead
  }
  return result
}

export const participantRegistrationResponse = <T extends Partial<JsonRegistration>>(
  registration: T,
  editToken: string
) => {
  const result = removeRegistrationCreationMetadata({ ...registration, editToken })
  delete result.editTokenVersion
  return result
}
