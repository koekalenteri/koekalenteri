/**
 * The tests' own rows in the local DynamoDB. Every test writes what it needs under ids of its own
 * and never empties a table, so tests do not depend on each other's order or leftovers.
 */
import type { JsonConfirmedEvent } from '../../src/types'
import { randomUUID } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb'
import { DYNAMODB_ENDPOINT } from '../env.mjs'
import { endOfDay, helsinkiYear, startOfDay } from './dates'

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
    endpoint: DYNAMODB_ENDPOINT,
    region: 'eu-north-1',
  }),
  { marshallOptions: { removeUndefinedValues: true } }
)

/** The table names CustomDynamoClient derives from the template's logical ids. */
const TABLES = {
  event: 'event-table',
} as const

const putItem = (table: string, item: object) => client.send(new PutCommand({ Item: item, TableName: table }))

/** A short id that is unique across runs, readable in a trace. */
const uniqueId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`

/**
 * A confirmed NOME-B trial whose entry is open today and which takes place in two weeks, with
 * whatever the test overrides. The name carries the id, so a test can find its own event among the
 * others on the page.
 */
export const seedEvent = async (overrides: Partial<JsonConfirmedEvent> = {}): Promise<JsonConfirmedEvent> => {
  const id = overrides.id ?? uniqueId('e2e')
  const startDate = overrides.startDate ?? startOfDay(14)
  const now = new Date().toISOString()
  const event: JsonConfirmedEvent & { season: string } = {
    classes: [{ class: 'ALO', date: startDate, places: 20 }],
    contactInfo: {
      official: { email: 'official@example.com', name: 'Teemu Toimitsija', phone: '040 123 4567' },
      secretary: { email: 'secretary@example.com', name: 'Siiri Sihteeri', phone: '040 765 4321' },
    },
    cost: 50,
    costMember: 40,
    createdAt: now,
    createdBy: 'e2e',
    description: 'Selaintestin koe',
    endDate: startDate,
    entries: 0,
    entryEndDate: endOfDay(7),
    entryStartDate: startOfDay(-1),
    eventType: 'NOME-B',
    headquarters: { address: 'Koetie 1', name: 'Kokoontumispaikka', postalDistrict: 'Tampere', zipCode: '33100' },
    id,
    judges: [{ id: 100002, name: 'Tuomari 1', official: true }],
    kcId: 1234567,
    location: `E2E-paikka ${id}`,
    modifiedAt: now,
    modifiedBy: 'e2e',
    name: `E2E-koe ${id}`,
    official: { id: '1', name: 'Teemu Toimitsija' },
    organizer: { id: '1', name: 'Suomen Noutajakoirajärjestö ry' },
    places: 20,
    priority: ['member'],
    secretary: { id: '2', name: 'Siiri Sihteeri' },
    startDate,
    state: 'confirmed',
    ...overrides,
    // The public list reads events through gsiSeasonStartDate; PutEvent derives the season the same way.
    season: helsinkiYear(overrides.startDate ?? startDate),
  }
  await putItem(TABLES.event, event)
  return event
}
