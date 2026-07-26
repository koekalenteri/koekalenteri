import type { JsonRegistration } from '../../types'
import { randomUUID } from 'node:crypto'
import { CONFIG } from '../config'
import CustomDynamoClient from '../utils/CustomDynamoClient'

const { registrationTable } = CONFIG
const dynamoDB = new CustomDynamoClient(registrationTable)
const LEASE_DURATION_MS = 90 * 1000

type NewRegistrationPhase =
  | 'newRegistrationPublishedAt'
  | 'newRegistrationAuditAt'
  | 'newRegistrationEmailSentAt'
  | 'newRegistrationProcessedAt'

export const claimNewRegistrationPostProcessing = async (eventId: string, id: string) => {
  const token = randomUUID()
  const now = Date.now()
  try {
    await dynamoDB.update(
      { eventId, id },
      { set: { newRegistrationLease: { expiresAt: now + LEASE_DURATION_MS, token } } },
      registrationTable,
      undefined,
      {
        expression:
          'attribute_exists(#id) AND (attribute_not_exists(#newRegistrationLease) OR #newRegistrationLease.#expiresAt < :now)',
        names: { '#expiresAt': 'expiresAt', '#id': 'id', '#newRegistrationLease': 'newRegistrationLease' },
        values: { ':now': now },
      }
    )
  } catch (error) {
    if ((error as { name?: string }).name === 'ConditionalCheckFailedException') return undefined
    throw error
  }

  const registration = await dynamoDB.read<JsonRegistration>({ eventId, id }, registrationTable, true)
  if (!registration) throw new Error(`Registration '${id}' disappeared while claiming post-processing`)

  const release = async () => {
    try {
      await dynamoDB.update({ eventId, id }, { remove: ['newRegistrationLease'] }, registrationTable, undefined, {
        expression: '#newRegistrationLease.#token = :token',
        names: { '#newRegistrationLease': 'newRegistrationLease', '#token': 'token' },
        values: { ':token': token },
      })
    } catch (error) {
      if ((error as { name?: string }).name !== 'ConditionalCheckFailedException') throw error
    }
  }

  return { registration, release, token }
}

export const markNewRegistrationPhase = (eventId: string, id: string, token: string, phase: NewRegistrationPhase) =>
  dynamoDB.update({ eventId, id }, { set: { [phase]: new Date().toISOString() } }, registrationTable, undefined, {
    expression: '#newRegistrationLease.#token = :token',
    names: { '#newRegistrationLease': 'newRegistrationLease', '#token': 'token' },
    values: { ':token': token },
  })
