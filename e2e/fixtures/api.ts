/**
 * Setup through the public API, for tests about what comes after: a registration sent the way the
 * form sends it, so PutRegistration fills in what it derives, without driving the form each time.
 */
import type { JsonConfirmedEvent, JsonDog, JsonRegistration, JsonUser } from '../../src/types'
import { randomUUID } from 'node:crypto'
import { API_URL, FRONTEND_URL } from '../env.mjs'

type Person = Pick<JsonUser, 'email' | 'location' | 'name'>

export const registerThroughApi = async (
  event: Pick<JsonConfirmedEvent, 'dates' | 'eventType' | 'id'>,
  dog: JsonDog,
  owner: Person
): Promise<JsonRegistration> => {
  const person = { ...owner, membership: false, phone: '+358 40 1234567' }
  const now = new Date().toISOString()
  const body = {
    agreeToTerms: true,
    breeder: { name: 'Kennel E2E' },
    createdAt: now,
    createdBy: 'anonymous',
    creationIdempotencyKey: randomUUID(),
    dates: event.dates,
    dog,
    eventId: event.id,
    eventType: event.eventType,
    handler: person,
    id: '',
    language: 'fi',
    modifiedAt: now,
    modifiedBy: 'anonymous',
    notes: '',
    owner: person,
    ownerHandles: true,
    ownerPays: true,
    owners: [{ ...person, key: 'owner-1' }],
    payer: person,
    qualifies: true,
    qualifyingResults: [],
    reserve: 'DAY',
    results: [],
    state: 'creating',
  }
  const response = await fetch(`${API_URL}/registration`, {
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Origin: FRONTEND_URL },
    method: 'POST',
  })
  if (!response.ok) throw new Error(`registration failed: ${response.status} ${await response.text()}`)
  return (await response.json()) as JsonRegistration
}
