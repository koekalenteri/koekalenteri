/**
 * Shared bits of the integration tests (`*.integration.test.ts`, the `integration` vitest project):
 * the lambda code against real tables in a DynamoDB-local, created from `template/tables` by
 * `scripts/integration-global-setup.mjs` and reached through the endpoint, access key and table
 * names `scripts/test-integration.js` sets (KOE-1369).
 *
 * The tables are reset once per run and every file may run beside the others, so a test writes
 * under ids and partition values of its own and asserts on those, never on a table's whole content.
 */
import type { JsonDogEvent, JsonUser } from '../../types'
import { randomUUID } from 'node:crypto'
import { DescribeTableCommand, DescribeTimeToLiveCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { eventWithParticipantsInvited } from '../../__mockData__/events'
import { dayStartOf, TIME_ZONE } from '../../lib/day'
import { getEventSeason } from '../../lib/event'

/** A value unique to one test, readable in a failure: `event-1a2b3c4d`. */
export const uniqueId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`

/** The raw client, configured like the lambda code's: from the environment alone. */
const client = new DynamoDBClient({})

/** The table as DynamoDB-local describes it, for comparing with what the template declares. */
export const describeTable = async (TableName: string) =>
  (await client.send(new DescribeTableCommand({ TableName }))).Table

export const describeTimeToLive = async (TableName: string) =>
  (await client.send(new DescribeTimeToLiveCommand({ TableName }))).TimeToLiveDescription

/** A user row under an id and an address of its own, a plain user unless the overrides say otherwise. */
export const storedUser = (overrides: Partial<JsonUser> = {}): JsonUser => {
  const id = uniqueId('user')
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'test',
    email: `${id}@example.com`,
    id,
    modifiedAt: '2026-01-01T00:00:00.000Z',
    modifiedBy: 'test',
    name: `User ${id}`,
    ...overrides,
  }
}

/**
 * A confirmed event row of a club of its own, two weeks from now unless `startDate` says otherwise,
 * with the keys the indexes are derived from (`season`, `organizerId`, `updatedAt`) as PutEvent
 * stores them.
 */
export const storedEvent = (overrides: Partial<JsonDogEvent> = {}): JsonDogEvent => {
  const startDate = overrides.startDate ?? dayStartOf(new Date(), TIME_ZONE, 14).toISOString()
  const organizerId = overrides.organizerId ?? uniqueId('org')
  return {
    ...JSON.parse(JSON.stringify(eventWithParticipantsInvited)),
    endDate: startDate,
    id: uniqueId('event'),
    organizer: { id: organizerId, name: `Club ${organizerId}` },
    organizerId,
    season: getEventSeason(startDate),
    startDate,
    state: 'confirmed',
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

/** The ids of the events a handler answered with. */
export const idsIn = (body: string): string[] => JSON.parse(body).map((event: { id: string }) => event.id)
